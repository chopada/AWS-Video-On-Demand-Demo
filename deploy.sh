cd lambda
npm i
cd ..
zip -r lambda.zip lambda/*
terraform init
terraform apply -auto-approve