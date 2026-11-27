create table if not exists app_users (
    id            bigint auto_increment primary key,
    email         varchar(254) not null unique,
    first_name    varchar(80)  not null,
    password_hash varchar(255) not null,
    created_at    timestamp    not null default current_timestamp
);

create table if not exists mileage_entries (
    id             bigint auto_increment primary key,
    user_id        bigint       not null references app_users(id) on delete cascade,
    entry_date     date         not null,
    initials       varchar(10)  not null,
    start_location varchar(200) not null,
    end_location   varchar(200) not null,
    odometer_start decimal(12,1) not null,
    odometer_end   decimal(12,1) not null,
    created_at     timestamp    not null default current_timestamp
);
create index if not exists idx_entries_user on mileage_entries(user_id, entry_date);

create table if not exists user_initials (
    user_id  bigint      not null references app_users(id) on delete cascade,
    initials varchar(10) not null,
    primary key (user_id, initials)
);

-- Spring Security WebAuthn (passkey) tables
create table if not exists user_entities (
    id           varchar(1000) not null,
    name         varchar(100)  not null,
    display_name varchar(200),
    primary key (id)
);

create table if not exists user_credentials (
    credential_id                varchar(1000) not null,
    user_entity_user_id          varchar(1000) not null,
    public_key                   blob          not null,
    signature_count              bigint,
    uv_initialized               boolean,
    backup_eligible              boolean       not null,
    authenticator_transports     varchar(1000),
    public_key_credential_type   varchar(100),
    backup_state                 boolean       not null,
    attestation_object           blob,
    attestation_client_data_json blob,
    created                      timestamp,
    last_used                    timestamp,
    label                        varchar(1000) not null,
    primary key (credential_id)
);

-- Program each trip belongs to (added after first release; safe on existing databases)
alter table mileage_entries add column if not exists program varchar(100) not null default '';

create table if not exists user_programs (
    user_id bigint       not null references app_users(id) on delete cascade,
    program varchar(100) not null,
    primary key (user_id, program)
);

-- One saved spreadsheet template per user (stored inside the encrypted database)
create table if not exists user_templates (
    user_id     bigint       primary key references app_users(id) on delete cascade,
    file_name   varchar(255) not null,
    content     blob         not null,
    uploaded_at timestamp    not null default current_timestamp
);

-- Reimbursement rate per mile. Each rate applies from its effective date onward,
-- so changing the rate later never rewrites past reimbursements.
create table if not exists user_rates (
    user_id        bigint       not null references app_users(id) on delete cascade,
    effective_date date         not null,
    rate           decimal(7,4) not null,
    primary key (user_id, effective_date)
);
