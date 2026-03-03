PRAGMA foreign_keys = OFF;
DROP TABLE markets;
ALTER TABLE markets_new RENAME TO markets;
CREATE INDEX markets_status_idx ON markets(status);
CREATE INDEX markets_type_idx ON markets(type);
PRAGMA foreign_keys = ON;
