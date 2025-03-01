# aws-ssm-update-association-action

[![GitHub Super-Linter](https://github.com/actions/typescript-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/typescript-action/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

<!-- action-docs-description source="action.yml" -->

## Description

GitHub Action for updating AWS SSM State Manager association with new
parameters.

<!-- action-docs-description source="action.yml" -->

More info about how Mercury is using this action in production can be found in
this NixCon talk:
[![NixCon2024 Scalable and secure NixOS deploys on AWS](https://img.youtube.com/vi/Ee4JN3Fp17o/0.jpg)](https://www.youtube.com/watch?v=Ee4JN3Fp17o)

## Usage

This action is similar to
https://github.com/MercuryTechnologies/aws-ssm-send-command-action, However
unlike a single command, an association is continously applied. If new instances
are launched, the association will send commands to the new instances as well.

For example, you could create an association like this in Terraform, using the
NixOS deploy document from
https://github.com/MercuryTechnologies/terraform-aws-ssm-nixos-deploy-document:

```hcl
resource "aws_ssm_association" "prometheus" {
  name = module.ssm_nixos_deploy_document.id
  targets {
    key    = "tag:Role"
    values = ["prometheus"]
  }
  max_errors      = "50%"
  max_concurrency = "50%"
}

output "association_id" {
  value = aws_ssm_association.prometheus.id
}
```

then in your deploy pipeline, you could update the association with the latest
version of your NixOS image:

```yaml
- uses: MercuryTechnologies/aws-ssm-update-association-action@v0
  with:
    association-id: '${{ steps.terraform-output.outputs.association_id }}'
    parameters: '{"installable":[toJSON(steps.build-nixos.outputs.store-path)]}'
    wait-until-association-updated: true
    max-wait-time: 600
```

<!-- action-docs-inputs source="action.yml" -->

## Inputs

| name                             | description                                                                                                                                                  | required | default |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------- |
| `association-id`                 | <p>The ID of the association you want to update.</p>                                                                                                         | `true`   | `""`    |
| `parameters`                     | <p>The parameters you want to update for the association.</p>                                                                                                | `false`  | `""`    |
| `wait-until-association-updated` | <p>Wait until the association is updated.</p>                                                                                                                | `false`  | `false` |
| `max-wait-time`                  | <p>The maximum time to wait for the association to be updated.</p>                                                                                           | `false`  | `300`   |
| `log-failed-command-invocations` | <p>Log the command invocations that failed for the association. If the command target is targeting hundreds or thousands of instances, this can be slow.</p> | `false`  | `false` |

<!-- action-docs-inputs source="action.yml" -->

<!-- action-docs-outputs source="action.yml" -->

<!-- action-docs-outputs source="action.yml" -->

## Credentials

By default, this action relies on the
[default behavior of the AWS SDK for JavasSript](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html)
to determine AWS credentials and region. You can use
[the `aws-actions/configure-aws-credentials` action](https://github.com/aws-actions/configure-aws-credentials)
to configure the GitHub Actions environment with environment variables
containing AWS credentials and your desired region.

```yaml
- uses: 'aws-actions/configure-aws-credentials@v4'
  with:
    role-to-assume: 'arn:aws:iam::123456789012:role/MyRole'
    aws-region: 'us-west-2'
```

## Permissions

Updating an association requires the `ssm:UpdateAssociation` and
`ssm:DescribeAssociation` permission. It's recommended to write a policy that
allows sending commands to specific resources, rather than allowing all
resources. See
[the AWS documentation](https://docs.aws.amazon.com/service-authorization/latest/reference/list_awssystemsmanager.html#awssystemsmanager-actions-as-permissions)
for more information.

For example, the following policy only allows updating associations in the
production environment, does not allow changing the document, and only allows
updating associations for instances in the production environment:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "UpdateAssociation",
      "Effect": "Allow",
      "Action": "ssm:UpdateAssociation",
      "Resource": [
        "arn:aws:ssm::*:association/*",
        "arn:aws:ec2:*:*:instance/*"
      ],
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Environment": "production"
        }
      }
    },
    {
      "Sid": "DescribeAssociation",
      "Effect": "Allow",
      "Action": "ssm:DescribeAssociation",
      "Resource": "*"
    }
  ]
}
```

When using the `log-failed-command-invocations` the following extra permissions
are required:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LogFailedCommandInvocations",
      "Effect": "Allow",
      "Action": [
        "ssm:DescribeAssociationExecutions",
        "ssm:DescribeAssociationExecutionTargets",
        "ssm:GetCommandInvocation"
      ],
      "Resource": "*"
    }
  ]
}
```

<!-- action-docs-runs source="action.yml" -->

## Runs

This action is a `node20` action.

<!-- action-docs-runs source="action.yml" -->
