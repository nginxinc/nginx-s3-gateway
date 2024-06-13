# Format for bucket name [bucket_name]--[azid]--x-s3
variable "bucket_name" {
  type    = string
  default = "example--usw2-az2--x-s3"
}

variable "owner_email" {
  type = string
}

variable "region" {
  type    = string
  default = "us-west-2"
}

# "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html#az-ids"
variable "availability_zone_id" {
  type    = string
  default = "usw2-az2"
}
