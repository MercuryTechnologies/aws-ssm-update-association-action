"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitUntilAssociationUpdated = exports.checkState = exports.checkResult = exports.checkStatus = void 0;
exports.getAllFailedInvocations = getAllFailedInvocations;
const ssm = __importStar(require("@aws-sdk/client-ssm"));
const util_waiter_1 = require("@smithy/util-waiter");
async function getAllFailedInvocations(client, commandId) {
    const failedInvocations = [];
    const invocations = await client.send(new ssm.ListCommandInvocationsCommand({
        CommandId: commandId,
        Filters: [{ key: 'Status', value: 'Failed' }]
    }));
    if (invocations.CommandInvocations) {
        for (const invocation of invocations.CommandInvocations) {
            const instanceId = invocation.InstanceId;
            if (instanceId) {
                const response = await client.send(new ssm.GetCommandInvocationCommand({
                    CommandId: commandId,
                    InstanceId: instanceId
                }));
                failedInvocations.push(response);
            }
        }
    }
    return failedInvocations;
}
const checkStatus = (status) => {
    switch (status) {
        case ssm.CommandStatus.PENDING:
        case ssm.CommandStatus.IN_PROGRESS:
            return util_waiter_1.WaiterState.RETRY;
        case ssm.CommandStatus.SUCCESS:
            return util_waiter_1.WaiterState.SUCCESS;
        case ssm.CommandStatus.CANCELLING:
        case ssm.CommandStatus.CANCELLED:
        case ssm.CommandStatus.FAILED:
        case ssm.CommandStatus.TIMED_OUT:
            return util_waiter_1.WaiterState.FAILURE;
    }
};
exports.checkStatus = checkStatus;
const checkResult = (result) => {
    if (!result.Commands) {
        return util_waiter_1.WaiterState.RETRY;
    }
    if (result.Commands.length !== 1) {
        return util_waiter_1.WaiterState.FAILURE;
    }
    const command = result.Commands[0];
    if (!command.Status) {
        return util_waiter_1.WaiterState.RETRY;
    }
    return (0, exports.checkStatus)(command.Status);
};
exports.checkResult = checkResult;
const checkState = async (client, input) => {
    const result = await client.send(new ssm.ListCommandsCommand(input));
    const reason = result;
    const state = (0, exports.checkResult)(result);
    return { state, reason };
};
exports.checkState = checkState;
/**
 * Wait until an association is updated.
 *
 * @param input  The input to ListAssociationsCommand for polling.
 * @param params Waiter configuration options.
 */
const waitUntilAssociationUpdated = async (params, input) => {
    const serviceDefaults = { minDelay: 5, maxDelay: 120 };
    return (0, util_waiter_1.createWaiter)({ ...serviceDefaults, ...params }, input, exports.checkState);
};
exports.waitUntilAssociationUpdated = waitUntilAssociationUpdated;
//# sourceMappingURL=ssm.js.map