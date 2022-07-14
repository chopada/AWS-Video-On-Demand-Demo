resource "aws_s3_bucket" "s3_bucket_video_on_demand_source" {
  bucket = "video-on-demand-source-bucket-${random_id.id.hex}"

  tags = {
    Name        = "video-on-demand-source-bucket-${random_id.id.hex}"
    Environment = "development"
  }
}

resource "aws_s3_object" "s3_bucket_job_settings_object" {
  for_each = fileset("${path.module}/job_settings", "*")

  bucket = aws_s3_bucket.s3_bucket_video_on_demand_source.bucket
  key    = "job_settings/${each.value}"
  source = "${path.module}/job_settings/${each.value}"

  etag = filemd5("${path.module}/job_settings/${each.value}")
}

resource "aws_s3_bucket_notification" "bucket_notification" {
  bucket = aws_s3_bucket.s3_bucket_video_on_demand_source.id

  lambda_function {
    id                  = "mpg-${random_id.id.hex}"
    lambda_function_arn = aws_lambda_function.lambda_submit_job.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = ""
    filter_suffix       = ".mpg"
  }
  lambda_function {
    id                  = "mp4-${random_id.id.hex}"
    lambda_function_arn = aws_lambda_function.lambda_submit_job.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = ""
    filter_suffix       = ".mp4"
  }
  lambda_function {
    id                  = "m4v-${random_id.id.hex}"
    lambda_function_arn = aws_lambda_function.lambda_submit_job.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = ""
    filter_suffix       = ".m4v"
  }
  lambda_function {
    id                  = "mov-${random_id.id.hex}"
    lambda_function_arn = aws_lambda_function.lambda_submit_job.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = ""
    filter_suffix       = ".mov"
  }
  lambda_function {
    id                  = "m2ts-${random_id.id.hex}"
    lambda_function_arn = aws_lambda_function.lambda_submit_job.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = ""
    filter_suffix       = ".m2ts"
  }

  depends_on = [aws_lambda_permission.allow_bucket_submit_job]
}

resource "aws_s3_bucket_public_access_block" "source_bucket_block_public_access" {
  bucket = aws_s3_bucket.s3_bucket_video_on_demand_source.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "s3_bucket_video_on_demand_destination" {
  bucket = "video-on-demand-destination-bucket-${random_id.id.hex}"

  tags = {
    Name        = "video-on-demand-destination-bucket-${random_id.id.hex}"
    Environment = "development"
  }
}

data "aws_iam_policy_document" "s3_bucket_video_on_demand_destination_policy_document" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.s3_bucket_video_on_demand_destination.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = [aws_cloudfront_origin_access_identity.video_distribution_access_identity.iam_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "s3_bucket_video_on_demand_destination_policy" {
  bucket = aws_s3_bucket.s3_bucket_video_on_demand_destination.id
  policy = data.aws_iam_policy_document.s3_bucket_video_on_demand_destination_policy_document.json
}

resource "aws_s3_bucket_public_access_block" "destination_bucket_block_public_access" {
  bucket = aws_s3_bucket.s3_bucket_video_on_demand_destination.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "destination_bucket_cors_configuration" {
  bucket = aws_s3_bucket.s3_bucket_video_on_demand_destination.bucket

  cors_rule {
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
    max_age_seconds = 3000
  }
}

output "SOURCE_S3_BUCKET" {
  value = "${aws_s3_bucket.s3_bucket_video_on_demand_source.bucket}"
}

output "DESTINATION_S3_BUCKET" {
  value = "${aws_s3_bucket.s3_bucket_video_on_demand_destination.bucket}"
}