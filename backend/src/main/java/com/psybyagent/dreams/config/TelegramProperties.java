package com.psybyagent.dreams.config;

import java.time.Duration;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "app.telegram")
public class TelegramProperties {

    private boolean enabled = false;
    private String botUsername = "";
    private String internalSecret = "";
    private Duration linkCodeTtl = Duration.ofMinutes(15);
}
