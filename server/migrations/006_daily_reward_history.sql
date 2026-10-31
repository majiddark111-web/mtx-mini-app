-- Additive archive: preserve the latest legacy claim without inventing its time.
-- Lock closes the gap between copying existing rows and installing the trigger.
SET LOCAL lock_timeout = '5s';
LOCK TABLE mtx_daily_claims IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE mtx_daily_reward_history (
  user_id TEXT NOT NULL,
  claim_day DATE NOT NULL,
  streak INTEGER NOT NULL CHECK (streak BETWEEN 1 AND 7),
  reward INTEGER NOT NULL CHECK (reward = streak * 100),
  claimed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, claim_day)
);

INSERT INTO mtx_daily_reward_history (user_id, claim_day, streak, reward, claimed_at)
SELECT user_id, claim_day, streak, streak * 100, NULL FROM mtx_daily_claims;

CREATE FUNCTION mtx_archive_daily_reward() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.claim_day = OLD.claim_day THEN
    RETURN NEW;
  END IF;
  INSERT INTO mtx_daily_reward_history (user_id, claim_day, streak, reward, claimed_at)
  VALUES (NEW.user_id, NEW.claim_day, NEW.streak, NEW.streak * 100, clock_timestamp())
  ON CONFLICT (user_id, claim_day) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DAILY_ALREADY_CLAIMED' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

-- Runs within the existing claim/balance transaction, also for the previous API
-- during a rolling deploy. Any failure rolls back claim, archive and credit.
CREATE TRIGGER mtx_archive_daily_reward
AFTER INSERT OR UPDATE OF claim_day ON mtx_daily_claims
FOR EACH ROW EXECUTE FUNCTION mtx_archive_daily_reward();
