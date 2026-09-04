import * as ssm from '@aws-sdk/client-ssm'
import {
  checkExceptions,
  createWaiter,
  WaiterState,
  WaiterResult,
  WaiterConfiguration
} from '@smithy/util-waiter'

export const checkStatus = (status: string): WaiterState => {
  switch (status) {
    case ssm.AssociationStatusName.Pending:
      return WaiterState.RETRY
    case ssm.AssociationStatusName.Success:
      return WaiterState.SUCCESS
    case ssm.AssociationStatusName.Failed:
    default:
      return WaiterState.FAILURE
  }
}

export const checkResult = (
  result: ssm.DescribeAssociationCommandOutput
): WaiterState => {
  if (result.AssociationDescription?.Overview?.Status) {
    return checkStatus(result.AssociationDescription.Overview.Status)
  }
  return WaiterState.RETRY
}

export const checkState = async (
  client: ssm.SSMClient,
  input: ssm.DescribeAssociationCommandInput
): Promise<WaiterResult> => {
  try {
    const result = await client.send(new ssm.DescribeAssociationCommand(input))
    return { state: checkResult(result), reason: result }
  } catch (error) {
    // SSM is eventually consistent: immediately after UpdateAssociation the
    // new version may not be readable yet. Keep polling until it appears.
    if (error instanceof ssm.InvalidAssociationVersion) {
      return { state: WaiterState.RETRY, reason: error }
    }
    throw error
  }
}

/**
 * Wait until an association is updated.
 *
 * @param input  The input to ListAssociationsCommand for polling.
 * @param params Waiter configuration options.
 */
export const waitUntilAssociationUpdated = async (
  params: WaiterConfiguration<ssm.SSMClient>,
  input: ssm.DescribeAssociationCommandInput
): Promise<WaiterResult> => {
  const serviceDefaults = { minDelay: 5, maxDelay: 120 }
  const result = await createWaiter(
    { ...serviceDefaults, ...params },
    input,
    checkState
  )
  return checkExceptions(result)
}
