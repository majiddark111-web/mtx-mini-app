import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { toggleComboSelection } from '../services/dailyChallengeService';
import { claimDaily, claimDailyChallenge, fetchDaily, fetchDailyChallenges, type DailyChallenges } from '../services/socialService';
import { useAppStore } from '../store/useAppStore';

const comboItems = [
  { id: 'upgrade:tap', icon: '👆', en: 'Tap upgrade', fa: 'ارتقای تپ' },
  { id: 'upgrade:energy', icon: '🔋', en: 'Energy upgrade', fa: 'ارتقای انرژی' },
  { id: 'upgrade:profit', icon: '📈', en: 'Profit upgrade', fa: 'ارتقای سود' },
  { id: 'skin:aurora', icon: '🌌', en: 'Aurora skin', fa: 'اسکین شفق' },
  { id: 'boost:recharge', icon: '⚡', en: 'Recharge boost', fa: 'بوست شارژ' },
  { id: 'consumable:energy', icon: '🔋', en: 'Energy pack', fa: 'بسته انرژی' },
] as const;

type Feedback = { kind: 'success' | 'error'; message: string } | undefined;

export function DailyRewardPage() {
  const auth = useAppStore((state) => state.authStatus);
  const { ar, text, number } = useI18n();
  const [daily, setDaily] = useState({ streak: 0, reward: 100, claimed: false });
  const [challenges, setChallenges] = useState<DailyChallenges>();
  const [cipher, setCipher] = useState('');
  const [combo, setCombo] = useState<string[]>([]);
  const [claiming, setClaiming] = useState<'combo' | 'cipher'>();
  const [feedback, setFeedback] = useState<Feedback>();
  const load = async () => {
    setDaily(await fetchDaily());
    setChallenges(await fetchDailyChallenges());
  };

  useEffect(() => { if (auth === 'authenticated') void load(); }, [auth]);

  const comboSlots = challenges?.combo.slots ?? 3;
  const cipherLength = challenges?.cipher.length ?? 3;
  const submitCombo = async () => {
    setClaiming('combo'); setFeedback(undefined);
    try {
      await claimDailyChallenge('combo', combo); await load(); setCombo([]);
      setFeedback({ kind: 'success', message: text('Daily combo reward received.', 'جایزه کمبوی روزانه دریافت شد.') });
    } catch {
      setFeedback({ kind: 'error', message: text('Combination is incorrect. Try a different order.', 'ترکیب درست نیست؛ ترتیب دیگری را امتحان کنید.') });
    } finally { setClaiming(undefined); }
  };
  const submitCipher = async () => {
    setClaiming('cipher'); setFeedback(undefined);
    try {
      await claimDailyChallenge('cipher', [cipher]); await load(); setCipher('');
      setFeedback({ kind: 'success', message: text('Daily cipher reward received.', 'جایزه رمز روزانه دریافت شد.') });
    } catch {
      setFeedback({ kind: 'error', message: text('Cipher is incorrect. Try again.', 'رمز اشتباه است؛ دوباره تلاش کنید.') });
    } finally { setClaiming(undefined); }
  };

  return <main className="page commerce-page">
    <Link className="brand" to="/">MTX</Link>
    <section className="daily-card">
      <span>{text('Day', 'روز')} {number(Math.min(7, daily.claimed ? daily.streak : daily.streak + 1))}</span>
      <h1>{number(daily.reward)} MTX</h1>
      <p>{text('Current streak', 'تداوم فعلی')}: {number(daily.streak)} {text('days', 'روز')}</p>
      <div className="streak-row">{[1, 2, 3, 4, 5, 6, 7].map((day) => <i className={day <= daily.streak ? 'active' : ''} key={day}>{number(day)}</i>)}</div>
      <button className="button primary" disabled={daily.claimed || auth !== 'authenticated'} onClick={() => void claimDaily().then(load)}>{daily.claimed ? text('Come back tomorrow', 'فردا برگردید') : text('Claim reward', 'دریافت جایزه')}</button>
    </section>
    {feedback && <p className={`challenge-feedback ${feedback.kind}`} role="status">{feedback.message}</p>}
    <section className="challenge-grid">
      <article className="combo-card">
        <h2>{text('Daily Combo', 'کمبوی روزانه')}</h2>
        <p>{text('Choose three cards in the correct order.', 'سه کارت را به ترتیب درست انتخاب کنید.')}</p>
        <div className="combo-slots" aria-label={text('Selected combination', 'ترکیب انتخاب‌شده')}>
          {Array.from({ length: comboSlots }, (_, index) => {
            const selected = comboItems.find((item) => item.id === combo[index]);
            return <button type="button" className={`combo-slot ${selected ? 'filled' : ''}`} key={index} disabled={!selected || Boolean(challenges?.combo.claimed)} onClick={() => selected && setCombo(toggleComboSelection(combo, selected.id, comboSlots))}><small>{number(index + 1)}</small><span>{selected?.icon ?? '?'}</span></button>;
          })}
        </div>
        <div className="combo-options">{comboItems.map((item) => {
          const order = combo.indexOf(item.id);
          return <button type="button" className={`combo-option ${order >= 0 ? 'selected' : ''}`} key={item.id} disabled={Boolean(challenges?.combo.claimed) || (combo.length >= comboSlots && order < 0)} onClick={() => setCombo(toggleComboSelection(combo, item.id, comboSlots))}>{order >= 0 && <b className="combo-order">{number(order + 1)}</b>}<span>{item.icon}</span><small>{text(item.en, item.fa)}</small></button>;
        })}</div>
        <button className="button primary" disabled={Boolean(challenges?.combo.claimed) || combo.length !== comboSlots || claiming === 'combo'} onClick={() => void submitCombo()}>{challenges?.combo.claimed ? text('Claimed', 'دریافت‌شده') : claiming === 'combo' ? text('Checking…', 'در حال بررسی…') : `${text('Claim', 'دریافت')} ${number(challenges?.combo.reward ?? 750)} MTX`}</button>
      </article>
      <article>
        <h2>{text('Daily Cipher', 'رمز روزانه')}</h2>
        <p>{ar ? 'اسم اللعبة الحالية' : text(challenges?.cipher.hint ?? 'The current game name', 'نام فعلی بازی')}</p>
        <input className="cipher-input" aria-label={text('Daily cipher answer', 'پاسخ رمز روزانه')} maxLength={cipherLength} value={cipher} placeholder={Array.from({ length: cipherLength }, () => '•').join(' ')} onChange={(event) => setCipher(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        <small className="cipher-counter">{number(cipher.length)} / {number(cipherLength)}</small>
        <button className="button primary" disabled={Boolean(challenges?.cipher.claimed) || cipher.trim().length !== cipherLength || claiming === 'cipher'} onClick={() => void submitCipher()}>{challenges?.cipher.claimed ? text('Claimed', 'دریافت‌شده') : claiming === 'cipher' ? text('Checking…', 'در حال بررسی…') : `${text('Decode for', 'رمزگشایی برای')} ${number(challenges?.cipher.reward ?? 500)} MTX`}</button>
      </article>
    </section>
  </main>;
}
