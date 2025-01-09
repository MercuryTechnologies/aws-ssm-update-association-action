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
exports.getJSONInput = getJSONInput;
exports.run = run;
const core = __importStar(require("@actions/core"));
const ssm = __importStar(require("@aws-sdk/client-ssm"));
const credential_providers_1 = require("@aws-sdk/credential-providers");
const util_waiter_1 = require("@smithy/util-waiter");
const ssmExt = __importStar(require("../src/ssm"));
function getJSONInput(name, options) {
    const val = core.getInput(name, options);
    if (val === '') {
        return undefined;
    }
    try {
        return JSON.parse(val);
    }
    catch (e) {
        if (e instanceof Error)
            throw new TypeError(`Input ${name} is not a valid JSON: ${e.message}`);
    }
}
/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
    try {
        const AssociationId = core.getInput('association-id', { required: true });
        const Name = core.getInput('name');
        const DocumentVersion = core.getInput('document-version');
        const Parameters = getJSONInput('parameters', {
            required: false
        });
        const waitUntilAssociationUpdated = core.getBooleanInput('wait-until-association-updated');
        const maxWaitTime = parseInt(core.getInput('max-wait-time'));
        let credentials;
        let region;
        const roleArn = core.getInput('role-to-assume');
        if (roleArn) {
            region = core.getInput('aws-region') || undefined;
            const aud = core.getInput('audience') || 'sts.amazonaws.com';
            credentials = (0, credential_providers_1.fromWebToken)({
                roleArn: roleArn,
                webIdentityToken: await core.getIDToken(aud)
            });
        }
        const config = { region, credentials };
        const client = new ssm.SSMClient(config);
        const updateAssociation = await client.send(new ssm.UpdateAssociationCommand({
            AssociationId,
            Name,
            DocumentVersion,
            Parameters
        }));
        const associationVersion = updateAssociation.AssociationDescription?.AssociationVersion;
        core.info(`Updated association to version ${associationVersion}`);
        core.setOutput('association-version', associationVersion);
        if (!waitUntilAssociationUpdated) {
            return;
        }
        core.info(`Waiting for version ${associationVersion} to be applied`);
        const result = await ssmExt.waitUntilAssociationUpdated({ client, maxWaitTime }, {
            AssociationFilterList: [{ key: 'AssociationId', value: AssociationId }]
        });
        if (result.state !== util_waiter_1.WaiterState.SUCCESS) {
            core.setFailed(`Waiting for association  ${AssociationId} failed: ${result.state}`);
        }
        /*if (result.state === WaiterState.FAILURE) {
          const failedInvocations = await ssmExt.getAllFailedInvocations(
            client,
            commandId
          )
          if (failedInvocations)
            for (const invocation of failedInvocations) {
              if (invocation.InstanceId) {
                core.startGroup(`Output of ${invocation.InstanceId}`)
                if (invocation.StandardOutputContent) {
                  core.info(invocation.StandardOutputContent)
                }
                if (invocation.StandardErrorContent) {
                  core.info(invocation.StandardErrorContent)
                }
                core.endGroup()
              }
            }
        }*/
    }
    catch (error) {
        // Fail the workflow run if an error occurs
        if (error instanceof Error)
            core.setFailed(error.message);
    }
}
//# sourceMappingURL=main.js.map