import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { toggleComboSelection } from '../services/dailyChallengeService';
import { claimDaily, claimDailyChallenge, fetchDaily, fetchDailyChallenges } from '../services/socialService';
import { useAppStore } from '../store/useAppStore';
import { useRewardRequest } from '../hooks/useRewardRequest';
import { RewardRequestStatus } from '../components/RewardRequestStatus';

const comboItems = [
  { id: 'upgrade:tap', icon: '👆', en: 'Tap upgrade', fa: 'ارتقای تپ' },
  { id: 'upgrade:energy', icon: '🔋', en: 'Energy upgrade', fa: 'ارتقای انرژی' },
  { id: 'upgrade:profit', icon: '📈', en: 'Profit upgrade', fa: 'ارتقای سود' },
  { id: 'skin:aurora', icon: '🌌', en: 'Aurora skin', fa: 'اسکین شفق' },
  { id: 'boost:recharge', icon: '⚡', en: 'Recharge boost', fa: 'بوست شارژ' },
  { id: 'consumable:energy', icon: '🔋', en: 'Energy pack', fa: 'بسته انرژی' },
] as const;

const loadRewards = async () => {
  const [daily, challenges] = await Promise.all([fetchDaily(), fetchDailyChallenges()]);
  return { daily, challenges };
};

export function DailyRewardPage() {
  const userId = useAppStore((state) => state.user.id);
  const request = useRewardRequest(loadRewards);
  const { ar, text, number } = useI18n();
  const daily = request.data?.daily;
  const challenges = request.data?.challenges;
  const [cipher, setCipher] = useState('');
  const [combo, setCombo] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  useEffect(() => { setFeedback(''); setCombo([]); setCipher(''); }, [userId, request.auth]);

  const comboSlots = challenges?.combo.slots ?? 3;
  const cipherLength = challenges?.cipher.length ?? 3;
  const submitCombo = async () => {
    if (!request.ready || challenges?.combo.claimed || combo.length !== comboSlots) return;
    setFeedback('');
    if (await request.run('combo', () => claimDailyChallenge('combo', combo))) {
      setCombo([]); setFeedback(text('Daily combo reward received.', 'جایزه کمبوی روزانه دریافت شد.'));
    }
  };
  const submitCipher = async () => {
    if (!request.ready || challenges?.cipher.claimed || cipher.trim().length !== cipherLength) return;
    setFeedback('');
    if (await request.run('cipher', () => claimDailyChallenge('cipher', [cipher]))) {
      setCipher(''); setFeedback(text('Daily cipher reward received.', 'جایزه رمز روزانه دریافت شد.'));
    }
  };
  const submitDaily = async () => {
    if (!request.ready || daily?.claimed) return;
    setFeedback('');
    if (await request.run('daily', claimDaily)) setFeedback(text('Daily reward received.', 'پاداش روزانه دریافت شد.'));
  };

  return <main className="page commerce-page">
    <Link className="brand" to="/">MTX</Link>
    <section className="daily-card">
      <span>{text('Day', 'روز')} {daily ? number(Math.min(7, daily.claimed ? daily.streak : daily.streak + 1)) : '—'}</span>
      <h1>{daily ? number(daily.reward) : '—'} MTX</h1>
      <p>{text('Current streak', 'تداوم فعلی')}: {daily ? number(daily.streak) : '—'} {text('days', 'روز')}</p>
      <div className="streak-row">{[1, 2, 3, 4, 5, 6, 7].map((day) => <i className={day <= (daily?.streak ?? 0) ? 'active' : ''} key={day}>{number(day)}</i>)}</div>
      <button className="button primary" disabled={!request.ready || daily?.claimed} onClick={() => void submitDaily()}>{daily?.claimed ? text('Come back tomorrow', 'فردا برگردید') : request.pending === 'daily' ? text('Checking…', 'در حال بررسی…') : text('Claim reward', 'دریافت جایزه')}</button>
    </section>
    <RewardRequestStatus authenticated={request.auth === 'authenticated'} loading={request.loading} error={request.error} retry={request.retry} />
    {feedback && !request.error && <p className="challenge-feedback success" role="status">{feedback}</p>}
    <section className="challenge-grid">
      <article className="combo-card">
        <h2>{text('Daily Combo', 'کمبوی روزانه')}</h2>
        <p>{text('Choose three cards in the correct order.', 'سه کارت را به ترتیب درست انتخاب کنید.')}</p>
        <div className="combo-slots" aria-label={text('Selected combination', 'ترکیب انتخاب‌شده')}>
          {Array.from({ length: comboSlots }, (_, index) => {
            const selected = comboItems.find((item) => item.id === combo[index]);
            return <button type="button" className={`combo-slot ${selected ? 'filled' : ''}`} key={index} disabled={!request.ready || !selected || Boolean(challenges?.combo.claimed)} onClick={() => selected && setCombo(toggleComboSelection(combo, selected.id, comboSlots))}><small>{number(index + 1)}</small><span>{selected?.icon ?? '?'}</span></button>;
          })}
        </div>
        <div className="combo-options">{comboItems.map((item) => {
          const order = combo.indexOf(item.id);
          return <button type="button" className={`combo-option ${order >= 0 ? 'selected' : ''}`} key={item.id} disabled={!request.ready || Boolean(challenges?.combo.claimed) || (combo.length >= comboSlots && order < 0)} onClick={() => setCombo(toggleComboSelection(combo, item.id, comboSlots))}>{order >= 0 && <b className="combo-order">{number(order + 1)}</b>}<span>{item.icon}</span><small>{text(item.en, item.fa)}</small></button>;
        })}</div>
        <button className="button primary" disabled={!request.ready || Boolean(challenges?.combo.claimed) || combo.length !== comboSlots} onClick={() => void submitCombo()}>{challenges?.combo.claimed ? text('Claimed', 'دریافت‌شده') : request.pending === 'combo' ? text('Checking…', 'در حال بررسی…') : `${text('Claim', 'دریافت')} ${number(challenges?.combo.reward ?? 750)} MTX`}</button>
      </article>
      <article>
        <h2>{text('Daily Cipher', 'رمز روزانه')}</h2>
        <p>{ar ? 'اسم اللعبة الحالية' : text(challenges?.cipher.hint ?? 'The current game name', 'نام فعلی بازی')}</p>
        <input className="cipher-input" disabled={!request.ready || Boolean(challenges?.cipher.claimed)} aria-label={text('Daily cipher answer', 'پاسخ رمز روزانه')} maxLength={cipherLength} value={cipher} placeholder={Array.from({ length: cipherLength }, () => '•').join(' ')} onChange={(event) => setCipher(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        <small className="cipher-counter">{number(cipher.length)} / {number(cipherLength)}</small>
        <button className="button primary" disabled={!request.ready || Boolean(challenges?.cipher.claimed) || cipher.trim().length !== cipherLength} onClick={() => void submitCipher()}>{challenges?.cipher.claimed ? text('Claimed', 'دریافت‌شده') : request.pending === 'cipher' ? text('Checking…', 'در حال بررسی…') : `${text('Decode for', 'رمزگشایی برای')} ${number(challenges?.cipher.reward ?? 500)} MTX`}</button>
      </article>
    </section>
  </main>;
}
