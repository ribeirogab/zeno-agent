ALTER TABLE `connectors` ADD `instance_label` text;--> statement-breakpoint
CREATE INDEX `idx_connectors_catalog_id` ON `connectors` (`catalog_id`);