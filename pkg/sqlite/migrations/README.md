# Creating a migration

1. Create new migration file in the migrations directory with the format `NN_description.up.sql`, where `NN` is the next sequential number.

   This fork numbers its migrations from 185 up, so that they never collide with upstream's
   (which is at 85). Migration versions are allowed to be non-contiguous - the migrator
   walks the versions that exist rather than counting up by one.

2. Update `pkg/sqlite/database.go` to update the `appSchemaVersion` value to the new migration number.

For migrations requiring complex logic or config file changes, see existing custom migrations for examples.