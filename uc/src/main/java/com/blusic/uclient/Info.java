package com.blusic.uclient;

import io.github.cdimascio.dotenv.Dotenv;

public class Info {
    private static final Dotenv dotenv = Dotenv.load();

    public static final String B2_KEY_ID = dotenv.get("B2_KEY_ID");
    public static final String B2_APP_KEY = dotenv.get("B2_APP_KEY");
    public static final String B2_ENDPOINT = dotenv.get("B2_ENDPOINT");
    public static final String B2_REGION = dotenv.get("B2_REGION");
    public static final String B2_BUCKET = dotenv.get("B2_BUCKET");
}