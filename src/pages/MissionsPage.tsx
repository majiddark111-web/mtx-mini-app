import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../hooks/useI18n';
import { claimMission, fetchMissions, type Mission } from '../services/socialService';
import { useAppStore } from '../store/useAppStore';

const titles: Record<string, { fa: string; ar: string }> = {
  'daily-taps': { fa: 'انجام ۵۰۰ تپ تأییدشده', ar: 'نفّذ 500 نقرة مؤكدة' },
  'weekly-coins': { fa: 'کسب ۱۰٬۰۰۰ MTX', ar: 'اربح 10,000 MTX' },
  'monthly-level': { fa: 'رسیدن به سطح ۱۰', ar: 'بلوغ المستوى 10' },
};

export function MissionsPage() {
  const auth = useAppStore((state) => state.authStatus);
  const { fa, ar, text, number } = useI18n();
  const [items, setItems] = useState<Mission[]>([]);
  const load = () => fetchMissions().then(setItems);
  useEffect(() => { if (auth === 'authenticated') void load(); }, [auth]);
  const period = (value: string) => fa ? value === 'daily' ? 'روزانه' : value === 'weekly' ? 'هفتگی' : 'ماهانه' : ar ? value === 'daily' ? 'يومي' : value === 'weekly' ? 'أسبوعي' : 'شهري' : value;
  const title = (item: Mission) => fa ? titles[item.id]?.fa ?? item.title : ar ? titles[item.id]?.ar ?? item.title : item.title;
  return <main className="page commerce-page"><Link className="brand" to="/">MTX</Link><header className="commerce-header"><div><h1>{text('Missions', 'مأموریت‌ها')}</h1><p>{text('Daily, weekly and monthly progress', 'پیشرفت روزانه، هفتگی و ماهانه')}</p></div></header><div className="social-list">{items.map((item) => <article className="social-card" key={item.id}><span className="tag">{period(item.period)}</span><h2>{title(item)}</h2><p>{number(item.progress)} / {number(item.target)}</p><div className="progress"><div style={{ width: `${item.progress / item.target * 100}%` }} /></div><strong>+{number(item.reward)} MTX</strong><button className="button primary" disabled={item.claimed || item.progress < item.target} onClick={() => void claimMission(item.id).then(load)}>{item.claimed ? text('Claimed', 'دریافت‌شده') : text('Claim', 'دریافت')}</button></article>)}</div></main>;
}
