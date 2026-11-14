import { RewardTopbar } from '../components/RewardTopbar';
import { useI18n } from '../hooks/useI18n';
import { claimMission, fetchMissions, type Mission } from '../services/socialService';
import { useRewardRequest } from '../hooks/useRewardRequest';
import { RewardRequestStatus } from '../components/RewardRequestStatus';

const titles: Record<string, { fa: string; ar: string }> = {
  'daily-taps': { fa: 'انجام ۵۰۰ تپ تأییدشده در امروز', ar: 'نفّذ 500 نقرة مؤكدة اليوم' },
  'weekly-coins': { fa: 'کسب ۱۰٬۰۰۰ MTX از بازی در این هفته', ar: 'اربح 10,000 MTX من اللعب هذا الأسبوع' },
  'monthly-level': { fa: '۱۰ سطح پیشرفت در این ماه', ar: 'تقدّم 10 مستويات هذا الشهر' },
};

export function MissionsPage() {
  const request = useRewardRequest(fetchMissions);
  const { fa, ar, text, number } = useI18n();
  const items = request.data ?? [];
  const submit = async (item: Mission) => {
    if (!request.ready || item.claimed || item.progress < item.target) return;
    await request.run(item.id, () => claimMission(item.id));
  };
  const period = (value: string) => fa ? value === 'daily' ? 'روزانه' : value === 'weekly' ? 'هفتگی' : 'ماهانه' : ar ? value === 'daily' ? 'يومي' : value === 'weekly' ? 'أسبوعي' : 'شهري' : value;
  const title = (item: Mission) => fa ? titles[item.id]?.fa ?? item.title : ar ? titles[item.id]?.ar ?? item.title : item.title;
  return <main className="page commerce-page robot-rewards">
    <RewardTopbar destination="daily-reward" />
    <header className="commerce-header"><div><h1>{text('Missions', 'مأموریت‌ها')}</h1><p>{text('Daily, weekly and monthly progress', 'پیشرفت روزانه، هفتگی و ماهانه')}</p></div></header>
    <RewardRequestStatus authenticated={request.auth === 'authenticated'} loading={request.loading} error={request.error} retry={request.retry} />
    {request.ready && items.length === 0 && <p className="reward-empty" role="status">{text('No missions available right now.', 'در حال حاضر مأموریتی وجود ندارد.')}</p>}
    <div className="social-list">{items.map((item) => {
      const ratio = item.target > 0 ? item.progress / item.target * 100 : 0;
      const percent = Number.isFinite(ratio) ? Math.max(0, Math.min(100, ratio)) : 0;
      return <article className={`social-card${item.claimed ? ' reward-claimed' : ''}`} key={item.id}>
      <span className="tag">{period(item.period)}</span><h2>{title(item)}</h2><p><bdi dir="ltr">{number(item.progress)} / {number(item.target)}</bdi></p>
      <div className="progress" role="progressbar" aria-label={title(item)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div style={{ width: `${percent}%` }} /></div><strong><bdi dir="ltr">+{number(item.reward)} MTX</bdi></strong>
      <button className="button primary" disabled={!request.ready || item.claimed || item.progress < item.target} onClick={() => void submit(item)}>{item.claimed ? text('Claimed', 'دریافت‌شده') : request.pending === item.id ? text('Checking…', 'در حال بررسی…') : text('Claim', 'دریافت')}</button>
    </article>; })}</div>
  </main>;
}
