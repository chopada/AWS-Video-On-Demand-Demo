resource "aws_lambda_permission" "allow_bucket_submit_job" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda_submit_job.arn
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.s3_bucket_video_on_demand_source.arn
}

resource "aws_lambda_function" "lambda_submit_job" {
  depends_on = [
    aws_iam_role.video_on_demand_lambda_role
  ]
  filename      = "lambda.zip"
  function_name = "submitJob"
  role          = aws_iam_role.video_on_demand_lambda_role.arn
  handler       = "lambda/handler.submitJob"
  runtime       = "nodejs14.x"
  environment {
    variables = {
      MEDIACONVERT_ENDPOINT = var.mediaconvert_endpoint,
      MEDIACONVERT_ROLE     = aws_iam_role.video_on_demand_media_convert_role.arn,
      JOB_SETTINGS          = var.job_settings,
      DESTINATION_BUCKET    = aws_s3_bucket.s3_bucket_video_on_demand_destination.bucket
      REGION                = var.aws_region
      SNS_TOPIC_ARN         = aws_sns_topic.vod_demo_user_updates.arn
    }
  }

  source_code_hash = filebase64sha256("lambda.zip")
}

resource "aws_lambda_permission" "allow_event_rule_complete_job" {
  statement_id  = "AllowExecutionFromEventRule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda_complete_job.arn
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.media_convert_job_status.arn
}

resource "aws_lambda_function" "lambda_complete_job" {
  depends_on = [
    aws_iam_role.video_on_demand_lambda_role
  ]
  filename      = "lambda.zip"
  function_name = "completeJob"
  role          = aws_iam_role.video_on_demand_lambda_role.arn
  handler       = "lambda/handler.completeJob"
  runtime       = "nodejs14.x"
  environment {
    variables = {
      MEDIACONVERT_ENDPOINT = var.mediaconvert_endpoint
      CLOUDFRONT_DOMAIN     = aws_cloudfront_distribution.video_distribution.domain_name
      JOB_MANIFEST          = var.job_manifest
      SOURCE_BUCKET         = aws_s3_bucket.s3_bucket_video_on_demand_source.bucket
      REGION                = var.aws_region
      SNS_TOPIC_ARN         = aws_sns_topic.vod_demo_user_updates.arn
    }
  }

  source_code_hash = filebase64sha256("lambda.zip")
}

