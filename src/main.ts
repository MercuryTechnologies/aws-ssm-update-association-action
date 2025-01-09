import * as core from '@actions/core'
import * as ssm from '@aws-sdk/client-ssm'

import * as ssmExt from '../src/ssm'
export function getJSONInput(
  name: string,
  options?: core.InputOptions
): unknown {
  const val = core.getInput(name, options)
  if (val === '') {
    return undefined
  }
  try {
    return JSON.parse(val)
  } catch (e) {
    if (e instanceof Error)
      throw new TypeError(`Input ${name} is not a valid JSON: ${e.message}`)
  }
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const AssociationId = core.getInput('association-id', { required: true })
    const Parameters = getJSONInput('parameters') as
      | Record<string, string[]>
      | undefined
    const waitUntilAssociationUpdated = core.getBooleanInput(
      'wait-until-association-updated'
    )
    const logFailedCommandInvocations = core.getBooleanInput(
      'log-failed-command-invocations'
    )
    const maxWaitTime = parseInt(core.getInput('max-wait-time'))

    const client = new ssm.SSMClient({})

    const describeAssociation = await client.send(
      new ssm.DescribeAssociationCommand({ AssociationId })
    )

    const updateAssociation = await client.send(
      new ssm.UpdateAssociationCommand({
        AssociationId,
        Parameters,
        // NOTE: we need to pass all the properties to avoid unsetting them
        // Quoting from the docs at https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_UpdateAssociation.html:
        // When you call UpdateAssociation, the system removes all optional
        // parameters from the request and overwrites the association with null
        // values for those parameters. This is by design. You must specify all
        // optional parameters in the call, even if you are not changing the
        // parameters. This includes the Name parameter. Before calling this API
        // action, we recommend that you call the DescribeAssociation API
        // operation and make a note of all optional parameters required for
        // your UpdateAssociation call.

        // NOTE: Name and DocumentVersion are omitted, such that we do not
        // require IAM permissions to access the document in order to update
        // the association.
        Targets: describeAssociation.AssociationDescription?.Targets,
        ScheduleExpression:
          describeAssociation.AssociationDescription?.ScheduleExpression,
        // Name: describeAssociation.AssociationDescription?.Name,
        OutputLocation:
          describeAssociation.AssociationDescription?.OutputLocation,
        AutomationTargetParameterName:
          describeAssociation.AssociationDescription
            ?.AutomationTargetParameterName,
        MaxErrors: describeAssociation.AssociationDescription?.MaxErrors,
        MaxConcurrency:
          describeAssociation.AssociationDescription?.MaxConcurrency,
        ComplianceSeverity:
          describeAssociation.AssociationDescription?.ComplianceSeverity,
        SyncCompliance:
          describeAssociation.AssociationDescription?.SyncCompliance,
        ApplyOnlyAtCronInterval:
          describeAssociation.AssociationDescription?.ApplyOnlyAtCronInterval,
        CalendarNames:
          describeAssociation.AssociationDescription?.CalendarNames,
        TargetLocations:
          describeAssociation.AssociationDescription?.TargetLocations,
        // DocumentVersion:
        // describeAssociation.AssociationDescription?.DocumentVersion,
        AlarmConfiguration:
          describeAssociation.AssociationDescription?.AlarmConfiguration,
        AssociationName:
          describeAssociation.AssociationDescription?.AssociationName,
        AssociationVersion:
          describeAssociation.AssociationDescription?.AssociationVersion,
        Duration: describeAssociation.AssociationDescription?.Duration,
        ScheduleOffset:
          describeAssociation.AssociationDescription?.ScheduleOffset,
        TargetMaps: describeAssociation.AssociationDescription?.TargetMaps
      })
    )
    const AssociationVersion =
      updateAssociation.AssociationDescription?.AssociationVersion

    core.info(`Updating association to version ${AssociationVersion}`)
    core.setOutput('association-version', AssociationVersion)
    if (!waitUntilAssociationUpdated) {
      return
    }
    core.info(`Waiting for version ${AssociationVersion} to be applied`)
    try {
      await ssmExt.waitUntilAssociationUpdated(
        { client, maxWaitTime },
        { AssociationId, AssociationVersion }
      )
      core.info(
        `Association version ${AssociationVersion} was successfully applied`
      )
    } catch (error) {
      if (!logFailedCommandInvocations) {
        throw error
      }
      // ASSUMPTION: The last execution that failed is from our version. We can't query by version unfortunately
      // This is a limitation of the DescribeAssociationExecutions API
      const executions = await client.send(
        new ssm.DescribeAssociationExecutionsCommand({
          AssociationId,
          Filters: [{ Key: 'Status', Type: 'EQUAL', Value: 'Failed' }],
          MaxResults: 1
        })
      )
      if (executions.AssociationExecutions) {
        for (const execution of executions.AssociationExecutions) {
          if (execution.AssociationVersion === AssociationVersion) {
            const executionTargets = await client.send(
              new ssm.DescribeAssociationExecutionTargetsCommand({
                AssociationId,
                ExecutionId: execution.ExecutionId
              })
            )
            if (executionTargets.AssociationExecutionTargets) {
              for (const target of executionTargets.AssociationExecutionTargets) {
                if (target.OutputSource?.OutputSourceType === 'RunCommand') {
                  await core.group(
                    `Output of ${target.ResourceId}`,
                    async () => {
                      const invocation = await client.send(
                        new ssm.GetCommandInvocationCommand({
                          CommandId: target.OutputSource?.OutputSourceId,
                          InstanceId: target.ResourceId
                        })
                      )
                      if (invocation.StandardOutputContent) {
                        core.info(invocation.StandardOutputContent)
                      }
                      if (invocation.StandardErrorContent) {
                        core.info(invocation.StandardErrorContent)
                      }
                    }
                  )
                }
              }
            }
          }
        }
      }
      throw error
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
