variable "aws_profile" {
  default = "terraform_admin"
}

variable "aws_region" {
  default = "ap-south-1" //replace with your aws region
}

variable "mediaconvert_endpoint" {
  default = "https://abcd1234.mediaconvert.us-west-2.amazonaws.com" //follow the steps as per the readme to fetch your aws mediaconvert endpoint and set here
}

variable "job_manifest" {
  default = "job_settings/jobs-manifest.json" //keep as it is
}

variable "job_settings" {
  default = "job_settings/config.json" //keep as it is
}

variable "mail_for_notifications" {
  default = "getsnsnotifications@gmail.com" //replace with your preffered mail address to get mediaconvert job status
}

resource "random_id" "id" {
  byte_length = 8
}