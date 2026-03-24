package com.psybyagent.dreams;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class DreamJournalApplication {

    public static void main(String[] args) {
        SpringApplication.run(DreamJournalApplication.class, args);
    }
}
