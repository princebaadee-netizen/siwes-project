-- Topic suggestions are their own paid model call, so they get their own line in
-- the usage summary instead of being folded into chapter drafting.
ALTER TYPE "GenerationType" ADD VALUE 'TOPIC_SUGGESTION';
