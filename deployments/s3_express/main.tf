provider "aws" {
  region = var.region
}

resource "aws_s3_directory_bucket" "example" {
  bucket = var.bucket_name
  location {
    name = var.availability_zone_id
  }

  force_destroy = true
}

data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "example" {
  statement {
    effect = "Allow"

    actions = [
      "s3express:*",
    ]

    resources = [
      aws_s3_directory_bucket.example.arn,
    ]

    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
}

resource "aws_s3_bucket_policy" "example" {
  bucket = aws_s3_directory_bucket.example.bucket
  policy = data.aws_iam_policy_document.example.json
}

# The filemd5() function is available in Terraform 0.11.12 and later
# For Terraform 0.11.11 and earlier, use the md5() function and the file() function:
# etag = "${md5(file("path/to/file"))}"
# etag = filemd5("path/to/file")
resource "aws_s3_object" "example" {
  bucket = aws_s3_directory_bucket.example.bucket
  key    = "test.txt"
  source = "${path.root}/test_data/test.txt"
}


