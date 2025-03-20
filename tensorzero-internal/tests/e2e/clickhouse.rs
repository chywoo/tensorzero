use std::future::Future;
use std::sync::Arc;

use paste::paste;
use reqwest::Client;
use secrecy::SecretString;
use serde_json::json;
use tensorzero_internal::clickhouse::migration_manager::migration_trait::Migration;
use tracing_test::traced_test;
use uuid::Uuid;

use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0000::Migration0000;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0002::Migration0002;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0003::Migration0003;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0004::Migration0004;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0005::Migration0005;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0006::Migration0006;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0008::Migration0008;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0009::Migration0009;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0011::Migration0011;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0013::Migration0013;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0015::Migration0015;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0016::Migration0016;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0017::Migration0017;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0018::Migration0018;
use tensorzero_internal::clickhouse::migration_manager::migrations::migration_0019::Migration0019;
use tensorzero_internal::clickhouse::migration_manager::{self};
use tensorzero_internal::clickhouse::test_helpers::{get_clickhouse, CLICKHOUSE_URL};
use tensorzero_internal::clickhouse::ClickHouseConnectionInfo;

fn get_clean_clickhouse() -> ClickHouseConnectionInfo {
    let database = format!(
        "tensorzero_e2e_tests_migration_manager_{}",
        Uuid::now_v7().simple()
    );
    let mut clickhouse_url = url::Url::parse(&CLICKHOUSE_URL).unwrap();
    clickhouse_url.set_path("");
    clickhouse_url.set_query(Some(format!("database={}", database).as_str()));

    ClickHouseConnectionInfo::Production {
        database_url: SecretString::from(clickhouse_url.to_string()),
        database: database.clone(),
        client: Client::new(),
    }
}

/// A helper macro to work with `#[traced_test]`. We need to generate a new `#[traced_test]`
/// function for each each run of `run_migrations_up_to`, to avoid mixing up the logs.
macro_rules! invoke_all {
    ($target_fn:ident, $migrations:expr, [$($migration_num:literal),*]) => {
        // Verify that the literal array matches the migrations array
        let literal_array = [$($migration_num),*];
        assert_eq!($migrations.len(), literal_array.len(), "The migration indices array must be the same length as the migrations array");
        for i in 0..$migrations.len() {
            assert_eq!(literal_array[i], i, "The migration indices array should be a list of numbers");
        }

        // For each value in the literal array, generate a new `#[traced_test]` function
        // that calls the target function with that value, along with the `logs_contain`
        // helper generated by the `traced_test` macro.
        $(
            paste! {
                #[traced_test]
                async fn [<helper_ $migration_num>] <F: Future<Output = ()>> (mut target_fn: impl FnMut(usize, fn(&str) -> bool) -> F) {
                    target_fn($migration_num, logs_contain).await;
                }

                // Invoke the generated function
                [<helper_ $migration_num>]($target_fn).await;
            }

        )*
    }
}

#[tokio::test]
async fn test_clickhouse_migration_manager() {
    let clickhouse = get_clean_clickhouse();
    clickhouse.create_database().await.unwrap();
    // Run it twice to test that it is a no-op the second time
    clickhouse.create_database().await.unwrap();

    // When creating a new migration, add it to the end of this array,
    // and adjust the call to `invoke_all!` to include the new array index.
    let migrations: &[Box<dyn Migration + '_>] = &[
        Box::new(Migration0000 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0002 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0003 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0004 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0005 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0006 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0008 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0009 {
            clickhouse: &clickhouse,
            clean_start: true,
        }),
        Box::new(Migration0011 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0013 {
            clickhouse: &clickhouse,
            clean_start: true,
        }),
        Box::new(Migration0015 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0016 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0017 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0018 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0019 {
            clickhouse: &clickhouse,
        }),
    ];

    // This runs all migrations up to and including the given migration number,
    // verifying that only the most recent migration is actually applied.
    let run_migrations_up_to = |migration_num: usize, logs_contain: fn(&str) -> bool| {
        let migrations = &migrations;
        async move {
            // All of the previous migrations should have already been run
            for (i, migration) in migrations.iter().enumerate().take(migration_num) {
                let clean_start = migration_manager::run_migration(migration.as_ref())
                    .await
                    .unwrap();
                if i == 0 {
                    // We know that the first migration was run in a previous test, so clean start should be false
                    assert!(!clean_start);
                }
                let name = migrations[i].name();
                assert!(
                    !logs_contain(&format!("Applying migration: {name}")),
                    "Migration {name} should not have been applied"
                );
                assert!(
                    !logs_contain(&format!("Migration succeeded: {name}")),
                    "Migration {name} should not have succeeded (because it wasn't applied)"
                );
            }

            let clean_start = migration_manager::run_migration(migrations[migration_num].as_ref())
                .await
                .unwrap();
            if migration_num == 0 {
                // When running for the first time, we should have a clean start.
                assert!(clean_start);
            }

            // The latest migration should get applied, since we haven't run it before
            let name = migrations[migration_num].name();
            assert!(logs_contain(&format!("Applying migration: {name}")));
            assert!(logs_contain(&format!("Migration succeeded: {name}")));
            assert!(!logs_contain("Failed to apply migration"));
            assert!(!logs_contain("Failed migration success check"));
            assert!(!logs_contain("Failed to verify migration"));
            assert!(!logs_contain("ERROR"));
        }
    };

    #[traced_test]
    async fn run_all(migrations: &[Box<dyn Migration + '_>]) {
        // Now, run all of the migrations, and verify that none of them apply
        for (i, migration) in migrations.iter().enumerate() {
            let clean_start = migration_manager::run_migration(migration.as_ref())
                .await
                .unwrap();
            if i == 0 {
                // We know that the first migration was run in a previous test, so clean start should be false
                assert!(!clean_start);
            }
            let name = migrations[i].name();
            assert!(!logs_contain(&format!("Applying migration: {name}")));
            assert!(!logs_contain(&format!("Migration succeeded: {name}")));
        }

        assert!(!logs_contain("Failed to apply migration"));
        assert!(!logs_contain("Failed migration success check"));
        assert!(!logs_contain("Failed to verify migration"));
        assert!(!logs_contain("ERROR"));
    }

    invoke_all!(
        run_migrations_up_to,
        &migrations,
        // This array must match the length of 'migrations' - the macro
        // will throw an error if it doesn't.
        // This must be an array literal, so that the macro can generate a function
        // for each element in the array.
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
    );
    run_all(migrations).await;

    let database = clickhouse.database();
    tracing::info!("Attempting to drop test database: {database}");

    clickhouse
        .run_query(format!("DROP DATABASE {database}"), None)
        .await
        .unwrap();
}

#[tokio::test]
async fn test_bad_clickhouse_write() {
    let clickhouse = get_clickhouse().await;
    // "name" should be "metric_name" here but we are using the wrong field on purpose to check that the write fails
    let payload =
        json!({"target_id": Uuid::now_v7(), "value": true, "name": "test", "id": Uuid::now_v7()});
    let err = clickhouse
        .write(&[payload], "BooleanMetricFeedback")
        .await
        .unwrap_err();
    assert!(err
        .to_string()
        .contains("Unknown field found while parsing JSONEachRow format: name"));
}

#[tokio::test]
async fn test_clean_clickhouse_start() {
    let clickhouse = get_clean_clickhouse();
    let start = std::time::Instant::now();
    migration_manager::run(&clickhouse).await.unwrap();
    let duration = start.elapsed();
    assert!(
        duration < std::time::Duration::from_secs(10),
        "Migrations took longer than 10 seconds: {duration:?}"
    );
}

#[tokio::test]
async fn test_concurrent_clickhouse_migrations() {
    let clickhouse = Arc::new(get_clean_clickhouse());
    let num_concurrent_starts = 100;
    let start = std::time::Instant::now();

    let mut handles = Vec::with_capacity(num_concurrent_starts);
    for _ in 0..num_concurrent_starts {
        let clickhouse_clone = clickhouse.clone();
        handles.push(tokio::spawn(async move {
            migration_manager::run(&clickhouse_clone).await.unwrap();
        }));
    }
    for handle in handles {
        handle.await.unwrap();
    }

    let duration = start.elapsed();
    assert!(
        duration < std::time::Duration::from_secs(60),
        "Migrations took longer than 60 seconds: {duration:?}"
    );
}

/// Migration 0013 has some checks that enforce that concurrent migrations can't break
/// the database.
/// This test enforces that the migration will error if there would be an invalid database state
/// rather than brick the database.
#[tokio::test]
async fn test_migration_0013_old_table() {
    let clickhouse = get_clean_clickhouse();
    clickhouse.create_database().await.unwrap();

    // When creating a new migration, add it to the end of this array,
    // and adjust the call to `invoke_all!` to include the new array index.
    let migrations: [Box<dyn Migration + '_>; 9] = [
        Box::new(Migration0000 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0002 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0003 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0004 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0005 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0006 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0008 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0009 {
            clickhouse: &clickhouse,
            clean_start: true,
        }),
        Box::new(Migration0011 {
            clickhouse: &clickhouse,
        }),
    ];

    // Run migrations up to right before 0013
    for migration in migrations.iter() {
        migration_manager::run_migration(migration.as_ref())
            .await
            .unwrap();
    }
    // Manually create a table that should not exist
    let query = r#"
        CREATE TABLE IF NOT EXISTS InferenceById
        (
            id UUID, -- must be a UUIDv7
            function_name LowCardinality(String),
            variant_name LowCardinality(String),
            episode_id UUID, -- must be a UUIDv7,
            function_type Enum('chat' = 1, 'json' = 2)
        ) ENGINE = MergeTree()
        ORDER BY id;
    "#;
    let _ = clickhouse.run_query(query.to_string(), None).await.unwrap();
    let err = migration_manager::run_migration(&Migration0013 {
        clean_start: false,
        clickhouse: &clickhouse,
    })
    .await
    .unwrap_err();
    assert!(err
        .to_string()
        .contains("InferenceById table is in an invalid state. Please contact TensorZero team."));
}

/// For this test, we will run all the migrations up to 0011, add some data to
/// the JSONInference table, then run migration 0013.
/// This should fail.
#[tokio::test]
async fn test_migration_0013_data_no_table() {
    let clickhouse = get_clean_clickhouse();
    clickhouse.create_database().await.unwrap();

    // When creating a new migration, add it to the end of this array,
    // and adjust the call to `invoke_all!` to include the new array index.
    let migrations: [Box<dyn Migration + '_>; 9] = [
        Box::new(Migration0000 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0002 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0003 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0004 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0005 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0006 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0008 {
            clickhouse: &clickhouse,
        }),
        Box::new(Migration0009 {
            clickhouse: &clickhouse,
            clean_start: true,
        }),
        Box::new(Migration0011 {
            clickhouse: &clickhouse,
        }),
    ];

    // Run migrations up to right before 0013
    for migration in migrations.iter() {
        migration_manager::run_migration(migration.as_ref())
            .await
            .unwrap();
    }

    // Add a row to the JsonInference table (would be very odd to have data in this table
    // but not an InferenceById table).
    let query = r#"
        INSERT INTO JsonInference (id, function_name, variant_name, episode_id, input, output, output_schema, inference_params, processing_time_ms)
        VALUES (generateUUIDv7(), 'test_function', 'test_variant', generateUUIDv7(), 'input', 'output', 'output_schema', 'params', 100)
    "#;
    let _ = clickhouse.run_query(query.to_string(), None).await.unwrap();
    let err = migration_manager::run_migration(&Migration0013 {
        clean_start: false,
        clickhouse: &clickhouse,
    })
    .await
    .unwrap_err();
    assert!(err.to_string()
        .contains("Data already exists in the ChatInference or JsonInference tables and InferenceById or InferenceByEpisodeId is missing. Please contact TensorZero team"));
}
