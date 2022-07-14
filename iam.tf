# IAM
resource "aws_iam_role" "video_on_demand_lambda_role" {
  name = "video_on_demand_lambda_role"

  assume_role_policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
POLICY
}

resource "aws_iam_role_policy_attachment" "video_on_demand_lambda_role_attach" {
  for_each   = toset(["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole", "arn:aws:iam::aws:policy/AWSElementalMediaConvertFullAccess", "arn:aws:iam::aws:policy/AmazonS3FullAccess", "arn:aws:iam::aws:policy/AmazonSNSFullAccess"])
  role       = aws_iam_role.video_on_demand_lambda_role.name
  policy_arn = each.key
}

resource "aws_iam_role" "video_on_demand_media_convert_role" {
  name = "video_on_demand_media_convert_role"

  assume_role_policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "mediaconvert.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
POLICY

  inline_policy {
    name = "vod_media_convert_inline_policy"

    policy = jsonencode({
      "Version" : "2012-10-17",
      "Statement" : [
        {
          "Action" : [
            "s3:GetObject",
            "s3:PutObject"
          ],
          "Resource" : [
            "${aws_s3_bucket.s3_bucket_video_on_demand_source.arn}/*",
            "${aws_s3_bucket.s3_bucket_video_on_demand_destination.arn}/*"
          ],
          "Effect" : "Allow"
        },
        {
          "Action" : "execute-api:Invoke",
          "Resource" : "*",
          "Effect" : "Allow"
        }
      ]
    })
  }
}
