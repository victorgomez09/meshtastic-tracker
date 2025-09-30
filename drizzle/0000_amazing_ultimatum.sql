CREATE TABLE "nodes" (
	"id" varchar(8) PRIMARY KEY NOT NULL,
	"region" varchar(10),
	"short_name" varchar(10),
	"long_name" varchar(255),
	"firmware_version" varchar(20),
	"position" geometry(point),
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
