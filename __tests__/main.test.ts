/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` should be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import * as core from '@actions/core'
import * as ssm from '@aws-sdk/client-ssm'
import * as main from '../src/main'
import * as ssmExt from '../src/ssm'
import { WaiterState } from '@smithy/util-waiter'
import { mockClient } from 'aws-sdk-client-mock'
import 'aws-sdk-client-mock-jest'

describe('getJSONInput', () => {
  const getInputMock = jest.spyOn(core, 'getInput').mockImplementation()
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('returns an object from a JSON string', () => {
    getInputMock.mockReturnValue('{"key":"value"}')
    expect(main.getJSONInput('key')).toEqual({ key: 'value' })
    expect(getInputMock).toHaveBeenCalled()
  })
  it('returns undefined if the input is empty', () => {
    getInputMock.mockReturnValue('')
    expect(main.getJSONInput('key')).toBeUndefined()
    expect(getInputMock).toHaveBeenCalled()
  })
  it('throws error if syntax error', () => {
    getInputMock.mockReturnValue('{"key":"value"')
    expect(() => main.getJSONInput('key')).toThrow()
    expect(getInputMock).toHaveBeenCalled()
  })
})

describe('run', () => {
  const ssmMock = mockClient(ssm.SSMClient)
  const getBooleanInputMock = jest.spyOn(core, 'getBooleanInput')
  const getInputMock = jest.spyOn(core, 'getInput')
  const getIDTokenMock = jest.spyOn(core, 'getIDToken')
  const setOutputMock = jest.spyOn(core, 'setOutput')
  const setFailedMock = jest.spyOn(core, 'setFailed')
  const infoMock = jest.spyOn(core, 'info')
  const setErrorMock = jest.spyOn(core, 'error')
  const groupMock = jest.spyOn(core, 'group')
  const waitUntilAssociationUpdatedMock = jest.spyOn(
    ssmExt,
    'waitUntilAssociationUpdated'
  )
  beforeEach(() => {
    jest.clearAllMocks()
    ssmMock.resetHistory()
    ssmMock.on(ssm.DescribeAssociationCommand).resolves({
      AssociationDescription: {}
    })
    ssmMock
      .on(ssm.UpdateAssociationCommand)
      .resolves({ AssociationDescription: { AssociationVersion: '1' } })
    getBooleanInputMock.mockImplementation(name => {
      switch (name) {
        case 'wait-until-association-updated':
          return false
        default:
          return false
      }
    })
    getInputMock.mockImplementation(name => {
      switch (name) {
        case 'association-id':
          return 'id'
        case 'parameters':
          return '{"key":"value"}'
        case 'max-wait-time':
          return '6'
        default:
          return ''
      }
    })
    getIDTokenMock.mockImplementation()
    setOutputMock.mockImplementation()
    setFailedMock.mockImplementation()
    setErrorMock.mockImplementation()
    infoMock.mockImplementation()
    waitUntilAssociationUpdatedMock.mockImplementation()
  })

  it('calls setFailed on error', async () => {
    getInputMock.mockImplementation(() => {
      throw new Error('error')
    })
    const setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
    await main.run()
    expect(getInputMock).toHaveBeenCalled()
    expect(setFailedMock).toHaveBeenCalledWith('error')
  })

  it('updates an association', async () => {
    ssmMock.on(ssm.DescribeAssociationCommand).resolves({
      AssociationDescription: {}
    })
    await main.run()
    expect(getInputMock).toHaveBeenCalled()
    expect(getBooleanInputMock).toHaveBeenCalled()
    expect(ssmMock).toHaveReceivedCommandWith(ssm.UpdateAssociationCommand, {
      AssociationId: 'id',
      Parameters: { key: 'value' }
    })
    expect(setOutputMock).toHaveBeenCalledWith('association-version', '1')
  })

  it('preserves all arguments returned from DescribeAssociationCommand', async () => {
    const AssociationDescription: ssm.AssociationDescription = {
      AssociationId: 'id',
      Targets: [{ Key: 'value' }],
      ScheduleExpression: 'rate(1 minute)',
      Name: 'name',
      OutputLocation: { S3Location: { OutputS3BucketName: 'bucket' } },
      AutomationTargetParameterName: 'param',
      MaxErrors: '1',
      MaxConcurrency: '1',
      ComplianceSeverity: 'CRITICAL',
      SyncCompliance: 'AUTO',
      ApplyOnlyAtCronInterval: true,
      CalendarNames: ['calendar'],
      TargetLocations: [{ Accounts: ['account'] }],
      DocumentVersion: '1',
      AssociationName: 'name',
      AssociationVersion: '1'
    }

    ssmMock.on(ssm.DescribeAssociationCommand).resolves({
      AssociationDescription
    })

    await main.run()

    expect(ssmMock).toHaveReceivedCommandWith(ssm.UpdateAssociationCommand, {
      AssociationId: 'id',
      Targets: [{ Key: 'value' }],
      ScheduleExpression: 'rate(1 minute)',
      // Name: 'name',
      OutputLocation: { S3Location: { OutputS3BucketName: 'bucket' } },
      AutomationTargetParameterName: 'param',
      MaxErrors: '1',
      MaxConcurrency: '1',
      ComplianceSeverity: 'CRITICAL',
      SyncCompliance: 'AUTO',
      ApplyOnlyAtCronInterval: true,
      CalendarNames: ['calendar'],
      TargetLocations: [{ Accounts: ['account'] }],
      // DocumentVersion: '1',
      AssociationName: 'name',
      AssociationVersion: '1',
      Parameters: { key: 'value' }
    })
  })

  it('Waits for association to be updated', async () => {
    getBooleanInputMock.mockImplementation(name => {
      switch (name) {
        case 'wait-until-association-updated':
          return true
        default:
          return false
      }
    })
    const waitUntilAssociationUpdatedMock = jest
      .spyOn(ssmExt, 'waitUntilAssociationUpdated')
      .mockResolvedValue({ state: WaiterState.SUCCESS, reason: {} })
    await main.run()
    expect(getInputMock).toHaveBeenCalled()
    expect(getBooleanInputMock).toHaveBeenCalled()
    expect(ssmMock).toHaveReceivedCommandWith(ssm.UpdateAssociationCommand, {
      AssociationId: 'id',
      Parameters: { key: 'value' }
    })
    expect(waitUntilAssociationUpdatedMock).toHaveBeenCalled()
  })

  it('Does not print invocations when waiting succeeds', async () => {
    getBooleanInputMock.mockImplementation(name => {
      switch (name) {
        case 'wait-until-association-updated':
          return true
        default:
          return false
      }
    })
    ssmMock.on(ssm.DescribeAssociationCommand).resolves({
      AssociationDescription: {
        Overview: {
          Status: 'Success',
          AssociationStatusAggregatedCount: { Success: 1 },
          DetailedStatus: 'Success'
        }
      }
    })
    await main.run()
    expect(getInputMock).toHaveBeenCalled()
    expect(getBooleanInputMock).toHaveBeenCalled()
    expect(ssmMock).toHaveReceivedCommandWith(ssm.UpdateAssociationCommand, {
      AssociationId: 'id',
      Parameters: { key: 'value' }
    })
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(ssmMock).not.toHaveReceivedCommand(
      ssm.DescribeAssociationExecutionsCommand
    )
    expect(ssmMock).not.toHaveReceivedCommand(
      ssm.DescribeAssociationExecutionTargetsCommand
    )
    expect(ssmMock).not.toHaveReceivedCommand(ssm.GetCommandInvocationCommand)
    expect(infoMock).toHaveBeenCalledWith(
      'Association version 1 was successfully applied'
    )
  })
  it('fails when it times out', async () => {
    getBooleanInputMock.mockImplementation(name => {
      switch (name) {
        case 'wait-until-association-updated':
          return true
        default:
          return false
      }
    })
    ssmMock.on(ssm.DescribeAssociationCommand).resolves({
      AssociationDescription: {
        Overview: {
          Status: 'Pending',
          AssociationStatusAggregatedCount: { Pending: 1 },
          DetailedStatus: 'Pending'
        }
      }
    })
    ssmMock.on(ssm.DescribeAssociationExecutionsCommand).resolves({
      AssociationExecutions: []
    })
    waitUntilAssociationUpdatedMock.mockRejectedValue(new Error('timeout'))
    await main.run()
    expect(getInputMock).toHaveBeenCalled()
    expect(getBooleanInputMock).toHaveBeenCalled()
    expect(ssmMock).toHaveReceivedCommandWith(ssm.UpdateAssociationCommand, {
      AssociationId: 'id',
      Parameters: { key: 'value' }
    })
    expect(waitUntilAssociationUpdatedMock).toHaveBeenCalled()
    expect(setFailedMock).toHaveBeenCalled()
  })
  describe('failure', () => {
    beforeEach(() => {
      ssmMock.on(ssm.DescribeAssociationCommand).resolves({
        AssociationDescription: {
          Overview: {
            Status: 'Failed',
            AssociationStatusAggregatedCount: { Failed: 2 },
            DetailedStatus: 'Failed'
          }
        }
      })
      ssmMock.on(ssm.DescribeAssociationExecutionsCommand).resolves({
        AssociationExecutions: [
          {
            AssociationId: 'id',
            ExecutionId: '1',
            Status: 'Failed',
            AssociationVersion: '1'
          }
        ]
      })
      ssmMock
        .on(ssm.DescribeAssociationExecutionTargetsCommand, {
          AssociationId: 'id',
          ExecutionId: '1'
        })
        .resolves({
          AssociationExecutionTargets: [
            {
              ResourceId: 'i-123',
              OutputSource: {
                OutputSourceType: 'RunCommand',
                OutputSourceId: '1'
              }
            }
          ]
        })
      ssmMock
        .on(ssm.GetCommandInvocationCommand, {
          CommandId: '1',
          InstanceId: 'i-123'
        })
        .resolves({
          StandardErrorContent: 'no such file or directory',
          StandardOutputContent: 'output'
        })
      waitUntilAssociationUpdatedMock.mockRejectedValue(new Error('failed'))
    })

    it('doesnt print failed invocations when log-failed-command-invocations is false', async () => {
      getBooleanInputMock.mockImplementation(name => {
        switch (name) {
          case 'wait-until-association-updated':
            return true
          case 'log-failed-command-invocations':
          default:
            return false
        }
      })
      await main.run()
      expect(getInputMock).toHaveBeenCalled()
      expect(getBooleanInputMock).toHaveBeenCalled()
      expect(ssmMock).toHaveReceivedCommandWith(ssm.UpdateAssociationCommand, {
        AssociationId: 'id',
        Parameters: { key: 'value' }
      })
      expect(waitUntilAssociationUpdatedMock).toHaveBeenCalled()
      expect(setFailedMock).toHaveBeenCalledWith('failed')
      expect(ssmMock).not.toHaveReceivedCommand(
        ssm.DescribeAssociationExecutionsCommand
      )
      expect(ssmMock).not.toHaveReceivedCommand(
        ssm.DescribeAssociationExecutionTargetsCommand
      )
      expect(ssmMock).not.toHaveReceivedCommand(ssm.GetCommandInvocationCommand)
      expect(groupMock).not.toHaveBeenCalled()
      expect(infoMock).not.toHaveBeenCalledWith('no such file or directory')
      expect(infoMock).not.toHaveBeenCalledWith('output')
    })

    it('prints failed invocations when waiting fails', async () => {
      getBooleanInputMock.mockImplementation(name => {
        switch (name) {
          case 'wait-until-association-updated':
            return true
          case 'log-failed-command-invocations':
          default:
            return true
        }
      })
      await main.run()
      expect(getInputMock).toHaveBeenCalled()
      expect(getBooleanInputMock).toHaveBeenCalled()
      expect(ssmMock).toHaveReceivedCommandWith(ssm.UpdateAssociationCommand, {
        AssociationId: 'id',
        Parameters: { key: 'value' }
      })
      expect(waitUntilAssociationUpdatedMock).toHaveBeenCalled()
      expect(setFailedMock).toHaveBeenCalled()
      expect(ssmMock).toHaveReceivedCommand(
        ssm.DescribeAssociationExecutionsCommand
      )
      expect(ssmMock).toHaveReceivedCommand(
        ssm.DescribeAssociationExecutionTargetsCommand
      )
      expect(ssmMock).toHaveReceivedCommand(ssm.GetCommandInvocationCommand)
      expect(groupMock).toHaveBeenCalledWith(
        'Output of i-123',
        expect.any(Function)
      )
      expect(infoMock).toHaveBeenCalledWith('no such file or directory')
      expect(infoMock).toHaveBeenCalledWith('output')
    })
  })
})
