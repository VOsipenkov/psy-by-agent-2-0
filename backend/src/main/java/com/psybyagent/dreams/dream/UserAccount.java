package com.psybyagent.dreams.dream;

import com.psybyagent.dreams.common.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "users")
public class UserAccount extends AuditableEntity {

    @Column(nullable = false, unique = true, length = 40)
    private String username;

    @Column(length = 160)
    private String email;

    @Column(length = 100)
    private String passwordHash;
}
