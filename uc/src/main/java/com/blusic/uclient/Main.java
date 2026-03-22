package com.blusic.uclient;

public class Main {
    public static void main(String[] args) {
        if (args.length == 0) {
            System.out.println("no args passed.");
        } else {
            for (int i = 0; i < args.length; i++) {
                switch (args[i]) {
                    case "--upload":
                        if (i + 2 < args.length) {
                            String localPath = args[i + 1];
                            String remotePath = args[i + 2];
                            UClient client = new UClient();
                            client.uploadFile(localPath, remotePath);
                            client.close();
                            i += 2;
                        } else {
                            System.out.println("Usage: --upload <local> <remote>");
                        }
                        break;
                    case "--help":
                        System.out.println("Available commands:");
                        System.out.println("  --upload <local> <remote>  Upload a file to B2");
                        break;
                    default:
                        System.out.println("Unknown argument: " + args[i]);
                }
            }
        }
    }
}