# Running nginx-s3-gateway in AWS Elastic Container Service

The _nginx-s3-gateway_ project supports to run in an [AWS ECS (Elastic Container Service)](https://aws.amazon.com/ecs/) environment, both with static as well as with role-based, temporary credentials to access the underlying S3 bucket objects.
In this readme you will get valueable information to run this project in an ECS task with an IAM role (temporary credentials) in order to access objects of an S3 bucket.
As using static credentials with an ECS task is not recommended for security reasons, this is out of scope of this documentation, even though it should be working as well without much configuration changes.

## AWS Deployment

In this documentation, deployments of AWS ressources (like an S3 bucket, ECS cluster, etc.) will be done with [AWS CloudFormation](https://aws.amazon.com/cloudformation/), an infrastrcutre as code automation tool.
It allows to provision and deprovision resources as needed and ensures that this guide should be inter-operatable on any AWS account.
The example template, on which this documentation is based on, can be found in this directory under the filename [template.yml](./template.yml).
It also contains inline comments with more in-depth explanation and context of the single resources it will deploy.

Given you want to create a stack based on the provided example template, make sure the following:
- Review the template before you create a stack out of it to understand what it does
- Creating a stack from this template _will_ create resources in your AWS account that may inccur costs. Not all of the used resources may be covered by the [AWS free tier](https://aws.amazon.com/free). Check the resources provisioned by this template and your individual accounts conditions to estimate the costs incurred by creating this stack.
- The template is an example only. It is kept as simple as possible to give a basic idea of how to deploy this project. You might need to change and adjust settings and resources to fit your individual need or constraints.

## IAM Permissions

AWS ECS supports to supply a [task role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html) with which a task runs (not to be confused with the task execution role, which defines permissions used by ECS and it's agents to provision a task).
This feature allows task container to call AWS services without the need to have long-lived static credentials injected into the container.
The task role is an IAM role, which can be assumed by ECS, which defines the permissions the ECS task has based on the set of IAM policies attached to the role.

nginx-s3-gateway utilises this feature to fetch valid credentials from the passed in IAM task role.
These credentials will be used to make API calls against the configured S3 bucket (like downloading files).
As the credentials are temporary only, nginx-s3-gateway will cache the credentials as long as they are not expired based on the Expiration date provided by AWS ECS.
If credentials are close to expire, nginx-s3-gateway will automatically fetch a new set of credentials to ensure a continued service.

The IAM role you set as a task role for your ECS task therefore needs to have a policy which grants it access to the configured S3 bucket, which nginx is supposed to serve files from.
One way to grant these permissions is to use the `AmazonS3ReadOnlyAccess` managed policy (as done in the example template).
However, in a production-like environment, you may want to revisit this permission setup, as this managed policy allows the IAM role to access any AWS bucket in your account.
A more secure approach would be to create a new policy, which only grants access to the S3 bucket the nginx service is supposed to access, e.g.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:Get*",
                "s3:List*"
            ],
            "Resource": [
				"arn:aws:s3:::name-of-the-bucket",
				"arn:aws:s3:::name-of-the-bucket/*"
			]
        }
    ]
}
```
Where `name-of-the-bucket` is the name of the bucket where the objects are saved that nginx should serve.

## ECS Deployment

AWS ECS supports two different launch types for containers, EC2 and Fargate.
With EC2 you need to provide compute nodes based on AWS EC2 instances on your own, while with Fargate AWS manages the compute environment (as a very high-level explanation).
For simplicity the example template uses the Fargate launch type.
However, based on your specific requirements it might be needed to use the EC2 launch type in your environment.
If that is the case, you need to change that in the template, the ECS related deployment should, apart from the launch type, be the same, though.

The example template will also use a self-build VPC ([AWS Virtual Private Cloud](https://aws.amazon.com/vpc/)) where ECS tasks will be placed into (from the networking point of view).
This is needed to route traffic from an [AWS Application Load Balancer](https://aws.amazon.com/elasticloadbalancing/) to the containers managed by ECS.

## Provide nginx-s3-gateway within AWS Elastic Container Registry (ECR)

The example template expects the nginx-s3-gateway image to be available in a repository of the [AWS Elastic Container Registry](https://aws.amazon.com/ecr/).
In order to provide the image there, first create an ECR repository as described [in the documentation](https://docs.aws.amazon.com/AmazonECR/latest/userguide/repository-create.html).
Login to the repository as described in the same documentation as well on your local computer's docker daemon.

Pull the [official build of the nginx-s3-gateway image](https://github.com/nginxinc/nginx-s3-gateway/pkgs/container/nginx-s3-gateway%2Fnginx-oss-s3-gateway) or build it locally from source according to the documentation.
Then, push the nginx-s3-gateway image as described [in the documentation](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html).
