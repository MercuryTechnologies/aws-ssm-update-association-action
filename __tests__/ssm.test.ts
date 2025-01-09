import {
  checkStatus,
  checkResult,
  checkState,
  waitUntilAssociationUpdated
} from '../src/ssm'
import * as ssmExt from '../src/ssm'
import * as ssm from '@aws-sdk/client-ssm'
import { mockClient } from 'aws-sdk-client-mock'
import { WaiterState } from '@smithy/util-waiter'
import 'aws-sdk-client-mock-jest'

describe('checkStatus', () => {
  it('returns RETRY for Pending', () => {
    expect(checkStatus(ssm.AssociationStatusName.Pending)).toEqual(
      WaiterState.RETRY
    )
  })
  it('returns SUCCESS for Success', () => {
    expect(checkStatus(ssm.AssociationStatusName.Success)).toEqual(
      WaiterState.SUCCESS
    )
  })
  it('returns FAILURE for Failed', () => {
    expect(checkStatus(ssm.AssociationStatusName.Failed)).toEqual(
      WaiterState.FAILURE
    )
  })
})

describe('checkResult', () => {
  it('calls checkStatus with Overview.Status', () => {
    const checkResultSpy = jest.spyOn(ssmExt, 'checkStatus')
    checkResult({
      AssociationDescription: {
        Overview: { Status: ssm.AssociationStatusName.Pending }
      },
      $metadata: {}
    })
    expect(checkResultSpy).toHaveBeenCalledWith(
      ssm.AssociationStatusName.Pending
    )
  })
  it('returns RETRY if AssociationDescription is not set', () => {
    expect(checkResult({ $metadata: {} })).toEqual(WaiterState.RETRY)
  })
  it('returns RETRY if Overview is not set', () => {
    expect(checkResult({ AssociationDescription: {}, $metadata: {} })).toEqual(
      WaiterState.RETRY
    )
  })
  it('returns RETRY if Status is not set', () => {
    expect(
      checkResult({ AssociationDescription: { Overview: {} }, $metadata: {} })
    ).toEqual(WaiterState.RETRY)
  })
})

describe('checkState', () => {
  it('sends DescribeAssociationCommand and passes result to checkResult', async () => {
    const ssmMock = mockClient(ssm.SSMClient)
    const checkResultSpy = jest.spyOn(ssmExt, 'checkResult')
    const output = {
      AssociationDescription: {
        Overview: { Status: ssm.AssociationStatusName.Pending }
      },
      $metadata: {}
    }
    ssmMock.on(ssm.DescribeAssociationCommand).resolves(output)
    const client = new ssm.SSMClient({})
    const input = {}
    const result = await checkState(client, input)
    expect(ssmMock).toHaveReceivedCommandWith(
      ssm.DescribeAssociationCommand,
      input
    )
    expect(checkResultSpy).toHaveBeenCalledWith(output)
    expect(result).toEqual({ state: WaiterState.RETRY, reason: output })
  })
})

describe('waitUntilAssociationUpdated', () => {
  it('calls createWaiter with checkState', async () => {
    const ssmMock = mockClient(ssm.SSMClient)
    const checkStateSpy = jest.spyOn(ssmExt, 'checkState')
    const reason: ssm.DescribeAssociationCommandOutput = {
      AssociationDescription: {
        Overview: { Status: ssm.AssociationStatusName.Success }
      },
      $metadata: {}
    }
    ssmMock.on(ssm.DescribeAssociationCommand).resolves(reason)
    const client = new ssm.SSMClient({})
    const waiter = await waitUntilAssociationUpdated(
      { client, maxWaitTime: 6 },
      { AssociationId: 'id', AssociationVersion: '1' }
    )
    expect(checkStateSpy).toHaveBeenCalled()
    expect(waiter.reason).toEqual(reason)
  })
})
