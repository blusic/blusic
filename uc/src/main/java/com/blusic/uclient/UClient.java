package com.blusic.uclient;

import java.io.File;
import java.net.URI;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

public class UClient {

    private final S3Client s3;

    public UClient() {
        AwsBasicCredentials creds = AwsBasicCredentials.create(Info.B2_KEY_ID, Info.B2_APP_KEY);
        this.s3 = S3Client.builder()
                .credentialsProvider(StaticCredentialsProvider.create(creds))
                .endpointOverride(URI.create(Info.B2_ENDPOINT))
                .region(Region.of(Info.B2_REGION))
                .build();
    }

    public void uploadFile(String filePath, String key) {
        File file = new File(filePath);
        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(Info.B2_BUCKET)
                .key(key)
                .build();

        s3.putObject(request, file.toPath());
        System.out.println("Uploaded " + key);
    }

    public void close() {
        s3.close();
    }
}