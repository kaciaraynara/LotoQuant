import { useEffect, useState } from "react";
import {
  Sparkles,
  RefreshCw,
  LogOut,
  Star,
  CheckCircle2,
  BookmarkCheck,
  BookmarkPlus,
  History,
  Download,
  SlidersHorizontal,
  Layers,
  Wallet,
  Trophy,
  Trash2,
  Wand2,
  ShieldCheck,
  Eye,
  CalendarClock,
  Lock,
  Copy,
  Check,
  X,
  PartyPopper,
} from "lucide-react";
import { api } from "./services/api";
import LandingPage from "./components/LandingPage";

const DRAW_WEEKDAYS = {
  lotofacil: [1, 2, 3, 4, 5, 6],
  quina: [1, 2, 3, 4, 5, 6],
  supersete: [1, 3, 5],
  lotomania: [1, 3, 5],
  duplasena: [1, 3, 5],
  megasena: [2, 4, 6],
  diadesorte: [2, 4, 6],
  timemania: [2, 4, 6],
  maismilionaria: [3, 6],
};

const WEEKDAY_NAMES = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function computeNextDrawSchedule(slug, lastDrawDateStr = null) {
  const allowed = DRAW_WEEKDAYS[slug] || [1, 2, 3, 4, 5, 6];
  const isDaily = allowed.length >= 6;
  const now = new Date();
  let base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (lastDrawDateStr && /^\d{4}-\d{2}-\d{2}$/.test(lastDrawDateStr)) {
    const [y, m, d] = lastDrawDateStr.split("-").map(Number);
    const afterLast = new Date(y, m - 1, d + 1);
    if (afterLast > base) {
      base = afterLast;
    }
  }

  for (let offset = 0; offset < 8; offset++) {
    const cand = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    if (allowed.includes(cand.getDay())) {
      const dd = String(cand.getDate()).padStart(2, "0");
      const mm = String(cand.getMonth() + 1).padStart(2, "0");
      const yyyy = cand.getFullYear();
      const dateFormatted = `\${dd}/${mm}/${yyyy}`;
      const weekdayName = WEEKDAY_NAMES[cand.getDay()];
      return {
        isDaily,
        nextDate: dateFormatted,
        weekdayName,
        scheduleText: `${weekdayName},${dateFormatted} às 20h`,
      };
    }
  }

  return {
    isDaily,
    nextDate: now.toLocaleDateString("pt-BR"),
    weekdayName: WEEKDAY_NAMES[now.getDay()],
    scheduleText: `${WEEKDAY_NAMES[now.getDay()]},${now.toLocaleDateString("pt-BR")} às 20h`,
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ full_name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");

  const [modalities, setModalities] = useState([]);
  const [selectedMod, setSelectedMod] = useState("lotofacil");
  const [calibration, setCalibration] = useState(null);
  const [idealDailyGame, setIdealDailyGame] = useState(null);
  const [activeTab, setActiveTab] = useState("generator");

  const [quantity, setQuantity] = useState(4);
  const [fixedNums, setFixedNums] = useState([]);
  const [excludedNums, setExcludedNums] = useState([]);
  const [generatedGames, setGeneratedGames] = useState([]);
  const [savedIds, setSavedIds] = useState([]);
  const [copiedKey, setCopiedKey] = useState("");
  const [loadingGen, setLoadingGen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [savedBets, setSavedBets] = useState(() => {
    try {
      const raw = localStorage.getItem("lotoquant_saved_bets");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [closingPool, setClosingPool] = useState([]);
  const [guaranteeHits, setGuaranteeHits] = useState(13);
  const [conditionHits, setConditionHits] = useState(15);
  const [closingResult, setClosingResult] = useState(null);

  const [evForm, setEvForm] = useState({
    estimated_jackpot: 1700000,
    ticket_cost: 3.0,
    bankroll: 100.0,
    antipopularity_pct: 88.0,
  });
  const [evResult, setEvResult] = useState(null);

  const [backtestModal, setBacktestModal] = useState(null);
  const [resultModal, setResultModal] = useState(null);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [winnerBanner, setWinnerBanner] = useState(null);
  const [statusAlert, setStatusAlert] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem("lotoquant_saved_bets", JSON.stringify(savedBets));
    } catch {}
  }, [savedBets]);

  useEffect(() => {
    const token = localStorage.getItem("lotoquant_token");
    if (token) {
      api.me().then(setUser).catch(() => localStorage.removeItem("lotoquant_token"));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    api.getModalities().then(setModalities).catch(() => {});
    if (savedBets.length > 0) {
      runAutoCheckAll(savedBets);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !selectedMod) return;
    setFixedNums([]);
    setExcludedNums([]);
    setClosingPool([]);
    setClosingResult(null);
    setGeneratedGames([]);
    setIdealDailyGame(null);
    setEvResult(null);

    api.getCalibration(selectedMod)
      .then((cal) => {
        setCalibration(cal);
        loadIdealDailyPick(selectedMod);
      })
      .catch(async () => {
        await handleSyncCurrent(selectedMod);
      });
  }, [user, selectedMod]);

  const currentSpec = modalities.find((m) => m.slug === selectedMod);
  const currentSchedule = computeNextDrawSchedule(selectedMod, calibration?.reference_date);

  async function runAutoCheckAll(currentList) {
    if (!currentList || currentList.length === 0) return;
    try {
      const payload = currentList.map((b) => ({
        id: String(b.id),
        modality: b.modality,
        numbers: b.numbers,
        target_contest: b.targetContest,
      }));
      const res = await api.autoCheckBatch(payload);
      if (res?.results) {
        const newlyWon = [];
        const updatedList = currentList.map((item) => {
          const rep = res.results[String(item.id)];
          if (rep) {
            if (rep.status === "AUDITED" && rep.is_winner) {
              newlyWon.push({ ...item, auditReport: rep });
            }
            return { ...item, auditReport: rep };
          }
          return item;
        });
        setSavedBets(updatedList);
        if (newlyWon.length > 0) {
          setWinnerBanner(newlyWon[0]);
        }
      }
    } catch {}
  }

  async function loadIdealDailyPick(modSlug) {
    try {
      const res = await api.generate({
        modality: modSlug,
        quantity: 1,
        fixed_numbers: [],
        excluded_numbers: [],
      });
      if (res?.games?.length > 0) {
        setIdealDailyGame(res.games[0]);
      }
    } catch {}
  }

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError("");
    try {
      const res = authMode === "register"
        ? await api.register(authForm.full_name, authForm.email, authForm.password)
        : await api.login(authForm.email, authForm.password);
      localStorage.setItem("lotoquant_token", res.access_token);
      setUser(await api.me());
    } catch (err) {
      setAuthError(err.message);
    }
  }

  async function handleSyncCurrent(modSlug = selectedMod) {
    setSyncing(true);
    setStatusAlert({ type: "info", text: "Atualizando resultados oficiais e conferindo seus jogos..." });
    try {
      const syncRes = await api.syncModality(modSlug, 50);
      const cal = await api.getCalibration(modSlug);
      setCalibration(cal);
      await loadIdealDailyPick(modSlug);
      await runAutoCheckAll(savedBets);
      setStatusAlert({
        type: "success",
        text: `Tudo em dia! Último sorteio oficial: Concurso #\${syncRes.reference_contest}.`,
      });
    } catch (err) {
      setStatusAlert({ type: "error", text: `Não foi possível atualizar agora: ${err.message}` }); } finally { setSyncing(false); } }  function toggleNumberFilter(num) { if (fixedNums.includes(num)) { setFixedNums(fixedNums.filter((n) => n !== num)); setExcludedNums([...excludedNums, num]); } else if (excludedNums.includes(num)) { setExcludedNums(excludedNums.filter((n) => n !== num)); } else { setFixedNums([...fixedNums, num]); } }  function copyNumbers(numbers, tag) { const text = numbers.map((n) => String(n).padStart(2, "0")).join(" - "); navigator.clipboard.writeText(text); setCopiedKey(tag); setTimeout(() => setCopiedKey(""), 2200); }  async function handleGenerate(autoSmart = false) { setLoadingGen(true); setStatusAlert(null); try { let fixed = fixedNums; let excluded = excludedNums;  if (autoSmart && calibration?.number_weights) { const ranked = Object.entries(calibration.number_weights) .filter(([k]) => !k.startsWith("sec_") && !k.includes("_")) .sort((a, b) => b[1] - a[1]) .map(([k]) => Number(k)); const fixCount = currentSpec?.drawn_count >= 15 ? 4 : 2; fixed = ranked.slice(0, fixCount); excluded = ranked.slice(-5); setFixedNums(fixed); setExcludedNums(excluded); }  const res = await api.generate({ modality: selectedMod, quantity: Number(quantity), fixed_numbers: fixed, excluded_numbers: excluded, });  const gamesList = Array.isArray(res?.games) ? res.games : []; setGeneratedGames(gamesList); if (gamesList.length > 0 && gamesList[0].antipopularity_pct) { setEvForm((prev) => ({ ...prev, antipopularity_pct: gamesList[0].antipopularity_pct })); } setStatusAlert({ type: "success", text: `Pronto! ${gamesList.length} jogos preparados para o Concurso #${res.reference_contest} (${currentSchedule.scheduleText}).`,
      });
      setUser(await api.me());
    } catch (err) {
      setStatusAlert({ type: "error", text: err.message });
    } finally {
      setLoadingGen(false);
    }
  }

  function saveGameToNotebook(game, keyTag = "") {
    if (!game || !Array.isArray(game.numbers)) return;
    const betKey = `${selectedMod}-${game.numbers.join(",")}`;
    const sched = computeNextDrawSchedule(selectedMod, calibration?.reference_date);
    const entry = {
      id: `${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      modality: selectedMod,
      modalityName: currentSpec?.name || selectedMod.toUpperCase(),
      isDaily: sched.isDaily,
      scheduledDate: sched.nextDate,
      scheduledWeekday: sched.weekdayName,
      scheduleText: sched.scheduleText,
      targetContest: (calibration?.reference_contest || 0) + 1,
      savedAt: new Date().toLocaleDateString("pt-BR"),
      numbers: [...game.numbers],
      adherence_score: game.adherence_score,
      prize_breakdown: game.prize_breakdown || [],
      auditReport: null,
    };
    const updated = [entry, ...savedBets];
    setSavedBets(updated);
    setSavedIds((prev) => [...prev, keyTag || betKey]);
    runAutoCheckAll(updated);
    setStatusAlert({
      type: "success",
      text: `Jogo salvo! Sorteio marcado para \${sched.scheduleText}.`,
    });
  }

  async function handleViewBetResult(bet) {
    const sched = computeNextDrawSchedule(bet.modality, calibration?.reference_date);
    const fallbackNotice = `Sorteio ainda não realizado! Este jogo será sorteado na ${bet.scheduledWeekday \vert{}\vert{} sched.weekdayName}, dia${bet.scheduledDate || sched.nextDate} às 20h.`;

    try {
      const report = await api.postDrawAudit({
        modality: bet.modality,
        bet_numbers: bet.numbers,
        target_contest: bet.targetContest,
        apply_learning: false,
      });

      // Se o backend retornou PENDING OU se o concurso retornado ainda é menor que o concurso-alvo do bilhete, trava!
      if (report.status === "PENDING" || report.contest_number < bet.targetContest) {
        const lockedReport = {
          ...report,
          status: "PENDING",
          draw_date: bet.scheduledDate || sched.nextDate,
          weekday_name: bet.scheduledWeekday || sched.weekdayName,
          schedule_notice: fallbackNotice,
        };
        setSavedBets((prev) =>
          prev.map((item) => (item.id === bet.id ? { ...item, auditReport: lockedReport } : item))
        );
        setScheduleModal({ bet, report: lockedReport });
        return;
      }

      setSavedBets((prev) =>
        prev.map((item) => (item.id === bet.id ? { ...item, auditReport: report } : item))
      );
      setResultModal({ bet, report });
    } catch {
      const lockedReport = {
        status: "PENDING",
        contest_number: bet.targetContest,
        draw_date: bet.scheduledDate || sched.nextDate,
        weekday_name: bet.scheduledWeekday || sched.weekdayName,
        schedule_notice: fallbackNotice,
        diagnostics: [fallbackNotice],
      };
      setScheduleModal({ bet, report: lockedReport });
    }
  }

  async function trainSystemWithResult(bet) {
    setStatusAlert(null);
    try {
      const report = await api.postDrawAudit({
        modality: bet.modality,
        bet_numbers: bet.numbers,
        target_contest: bet.targetContest,
        apply_learning: true,
      });

      setSavedBets((prev) =>
        prev.map((item) => (item.id === bet.id ? { ...item, auditReport: report } : item))
      );

      if (bet.modality === selectedMod) {
        setCalibration(await api.getCalibration(bet.modality));
        await loadIdealDailyPick(bet.modality);
      }
      setResultModal(null);
      setStatusAlert({
        type: "success",
        text: `Cartão Ouro atualizado com os dados do Concurso #\${report.contest_number}!`,
      });
    } catch (err) {
      setStatusAlert({ type: "error", text: err.message });
    }
  }

  async function handleCalculateEv(e) {
    e.preventDefault();
    try {
      const res = await api.evaluateEv({
        modality: selectedMod,
        estimated_jackpot: Number(evForm.estimated_jackpot),
        ticket_cost: Number(evForm.ticket_cost),
        bankroll: Number(evForm.bankroll),
        antipopularity_pct: Number(evForm.antipopularity_pct),
      });
      setEvResult(res);
    } catch (err) {
      setStatusAlert({ type: "error", text: err.message });
    }
  }

  async function handleClosing() {
    setStatusAlert(null);
    try {
      const res = await api.closing({
        modality: selectedMod,
        selected_numbers: closingPool,
        guarantee_hits: Number(guaranteeHits),
        condition_hits: Number(conditionHits),
        max_tickets: 20,
      });
      setClosingResult(res);
    } catch (err) {
      setStatusAlert({ type: "error", text: err.message });
    }
  }

  async function handleBacktest(numbers) {
    try {
      const res = await api.backtest(selectedMod, numbers);
      setBacktestModal({ numbers, ...res });
    } catch (err) {
      setStatusAlert({ type: "error", text: err.message });
    }
  }

  async function handleUpgrade(tier) {
    try {
      await api.upgradePlan(user.email, tier);
      setUser(await api.me());
      setStatusAlert({ type: "success", text: `Plano ${tier.toUpperCase()} ativado.` }); setActiveTab("generator"); } catch (err) { setStatusAlert({ type: "error", text: err.message }); } }  function exportCsv(games) { const rows = [ ["Jogo", "Dezenas", "Forca_do_Jogo_\%", "Ganhar_Sozinho_\%"], ...games.map((g, i) => [ i + 1, g.numbers.map((n) => String(n).padStart(2, "0")).join(" - "), g.adherence_score, g.antipopularity_pct ?? "-", ]), ]; const csv = rows.map((r) => r.join(";")).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `jogos_${selectedMod}.csv`;
    a.click();
  }
  if (!user) {
    return (
      <LandingPage
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authError={authError}
        handleAuth={handleAuth}
      />
    );
  }

  const universe = currentSpec
    ? Array.from({ length: currentSpec.max_number - currentSpec.min_number + 1 }, (_, i) => currentSpec.min_number + i)
    : [];
  const auditedBets = savedBets.filter((b) => b.auditReport && b.auditReport.status === "AUDITED" && b.auditReport.contest_number >= b.targetContest);
  const winnersCount = auditedBets.filter((b) => b.auditReport.is_winner).length;
  const avgHits = auditedBets.length > 0
    ? (auditedBets.reduce((acc, b) => acc + b.auditReport.hits_count, 0) / auditedBets.length).toFixed(1)
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Cabeçalho */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-sm">
              LQ
            </div>
            <span className="text-xl font-extrabold tracking-tight text-slate-900">
              Loto<span className="text-indigo-600">Quant</span>
            </span>
            <span className="px-2.5 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase font-bold">
              Conta {user.plan_tier}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="hidden sm:inline text-slate-600">
              Jogos montados hoje: <strong className="text-indigo-600">{user.daily_generations_used}</strong>
            </span>
            <button
              onClick={() => handleSyncCurrent(selectedMod)}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 font-bold shadow-sm transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Atualizando..." : "Atualizar Resultados"}
            </button>
            <button
              onClick={() => { localStorage.removeItem("lotoquant_token"); setUser(null); }}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">
        {/* BANNER DE PARABÉNS AUTOMÁTICO AO PREMIAR */}
        {winnerBanner && (
          <div className="rounded-3xl p-5 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 animate-fade-up">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <PartyPopper className="w-7 h-7 text-amber-200" />
              </div>
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-100">
                  Parabéns! Você Tem Jogo Premiado!
                </span>
                <h3 className="text-lg sm:text-xl font-extrabold">
                  {winnerBanner.modalityName} • {winnerBanner.auditReport.hits_count} acertos no Concurso #{winnerBanner.auditReport.contest_number}!
                </h3>
                <p className="text-xs text-emerald-50">
                  Seu bilhete entrou na faixa de premiação oficial. Confira os números acertados agora mesmo.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveTab("saved");
                  handleViewBetResult(winnerBanner);
                }}
                className="px-4 py-2.5 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 font-extrabold text-xs shadow-sm transition"
              >
                Conferir Meu Prêmio
              </button>
              <button
                onClick={() => setWinnerBanner(null)}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Seletor de Loterias */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {modalities.map((m) => {
            const sched = computeNextDrawSchedule(m.slug);
            return (
              <button
                key={m.slug}
                onClick={() => setSelectedMod(m.slug)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap border transition flex items-center gap-1.5 ${
                  selectedMod === m.slug
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                }`}
              >
                <span>{m.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${selectedMod === m.slug ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {sched.isDaily ? "Diário" : "Dias Marcados"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Painel do Último Resultado Oficial + Data do Próximo Sorteio Sempre Visível */}
        {calibration && (
          <div className="clean-card p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 animate-fade-up">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Último Sorteio Oficial
                </span>
                <span className="text-xs text-slate-700 font-extrabold">
                  Concurso #{calibration.reference_contest} ({calibration.reference_date || "Atualizado"})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 font-semibold mr-1">Dezenas sorteadas:</span>
                {(calibration.reference_numbers || []).map((n) => (
                  <span
                    key={n}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-xs font-mono font-extrabold text-slate-800"
                  >
                    {String(n).padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase text-indigo-600 block">
                  Próximo Sorteio • Concurso #{calibration.reference_contest + 1}
                </span>
                <strong className="text-sm font-extrabold text-slate-900">
                  {currentSchedule.scheduleText}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* CARTÃO OURO DO DIA */}
        {idealDailyGame && (
          <div className="gold-card-glow rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-indigo-50/90 via-white to-emerald-50/90 border-2 border-indigo-300 space-y-4 animate-fade-up">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-extrabold bg-indigo-600 text-white uppercase shadow-sm">
                  <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                  Cartão Ouro • Concurso #{(calibration?.reference_contest || 0) + 1}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-white border border-indigo-200 text-indigo-800">
                  Data do Sorteio: {currentSchedule.scheduleText}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  Mira 1º e 2º Prêmio: {idealDailyGame.adherence_score}%
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => copyNumbers(idealDailyGame.numbers, "gold")}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold transition"
                >
                  {copiedKey === "gold" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === "gold" ? "Copiado!" : "Copiar Dezenas"}
                </button>
                <button
                  onClick={() => handleBacktest(idealDailyGame.numbers)}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold transition"
                >
                  <History className="w-3.5 h-3.5" />
                  Histórico de Acertos
                </button>
                <button
                  onClick={() => saveGameToNotebook(idealDailyGame, "ideal_daily")}
                  className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-bold shadow-sm transition"
                >
                  {savedIds.includes("ideal_daily") ? <BookmarkCheck className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
                  {savedIds.includes("ideal_daily") ? "Salvo na Sua Lista ✓" : "Salvar Cartão Ouro"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {idealDailyGame.numbers.map((n) => (
                <span
                  key={n}
                  className="ball-pop w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold bg-indigo-600 text-white shadow"
                >
                  {String(n).padStart(2, "0")}
                </span>
              ))}
            </div>

            {Array.isArray(idealDailyGame.prize_breakdown) && idealDailyGame.prize_breakdown.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-bold text-slate-600">Chances por Faixa de Prêmio:</span>
                {idealDailyGame.prize_breakdown.map((p) => (
                  <span
                    key={p.tier}
                    className="px-3 py-1 rounded-xl bg-white border border-indigo-200 text-xs font-bold text-indigo-900"
                  >
                    {p.tier}: <span className="text-emerald-700">{p.chance}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {statusAlert && (
          <div className={`p-3.5 rounded-2xl border text-sm font-semibold flex justify-between items-center animate-fade-up ${statusAlert.type === "error" ? "bg-red-50 border-red-200 text-red-700" : statusAlert.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-indigo-50 border-indigo-200 text-indigo-800"}`}>
            <span>{statusAlert.text}</span>
            <button onClick={() => setStatusAlert(null)} className="text-xs underline ml-4 font-bold">Fechar</button>
          </div>
        )}

        {/* Navegação por Abas */}
        <div className="flex gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
          {[
            { id: "generator", icon: SlidersHorizontal, label: "1. Montar Meus Jogos" },
            { id: "closing", icon: Layers, label: "2. Cercar Mais Números" },
            { id: "ev", icon: Wallet, label: "3. Quanto Apostar Hoje" },
            { id: "saved", icon: Trophy, label: `4. Meus Jogos & Conferência (${savedBets.length})` },
            { id: "plans", icon: Sparkles, label: "Planos" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ABA 1: MONTAR JOGOS */}
        {activeTab === "generator" && (
          <div className="grid lg:grid-cols-12 gap-6 animate-fade-up">
            <div className="lg:col-span-5 clean-card p-5 rounded-2xl space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">Toque nas Dezenas</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    1 toque: <span className="text-indigo-600 font-bold">Fixar no Jogo</span> • 2 toques:{" "}
                    <span className="text-red-600 font-bold">Excluir</span>. Borda roxa = números em alta.
                  </p>
                </div>
                {(fixedNums.length > 0 || excludedNums.length > 0) && (
                  <button
                    onClick={() => { setFixedNums([]); setExcludedNums([]); }}
                    className="text-xs text-slate-500 hover:text-slate-900 underline font-bold"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {universe.map((num) => {
                  const weight = calibration?.number_weights?.[String(num)] ?? 0.5;
                  const isFixed = fixedNums.includes(num);
                  const isExcluded = excludedNums.includes(num);
                  const isHot = weight >= 0.72;
                  let btnStyle = "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100";
                  if (isFixed) btnStyle = "bg-indigo-600 text-white border-indigo-600 font-extrabold shadow-sm";
                  else if (isExcluded) btnStyle = "bg-red-50 text-red-500 border-red-200 line-through";
                  else if (isHot) btnStyle = "bg-purple-50 border-purple-400 text-purple-900 font-bold";
                  return (
                    <button
                      key={num}
                      onClick={() => toggleNumberFilter(num)}
                      className={`ball-pop py-2 rounded-xl border text-sm ${btnStyle}`}
                    >
                      {String(num).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-28">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Quantos Jogos</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-bold"
                    />
                  </div>
                  <button
                    onClick={() => handleGenerate(false)}
                    disabled={loadingGen || !calibration}
                    className="mt-5 flex-1 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 shadow-sm transition"
                  >
                    {loadingGen ? "Montando..." : "Gerar Meus Jogos"}
                  </button>
                </div>

                <button
                  onClick={() => handleGenerate(true)}
                  disabled={loadingGen || !calibration}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 transition"
                >
                  <Wand2 className="w-4 h-4" />
                  Seleção Forte Automática (Fixa Melhores e Tira Fracas)
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 clean-card p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">Jogos Selecionados ({generatedGames.length})</h2>
                  <p className="text-xs text-slate-500">Para o Concurso #{(calibration?.reference_contest || 0) + 1} • {currentSchedule.scheduleText}</p>
                </div>
                {generatedGames.length > 0 && (
                  <button
                    onClick={() => exportCsv(generatedGames)}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Planilha
                  </button>
                )}
              </div>

              {generatedGames.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-500">Nenhum jogo montado nesta rodada ainda.</p>
                  <p className="text-xs text-slate-400">Clique em Gerar Meus Jogos ou use a Seleção Forte Automática ao lado.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {generatedGames.map((game, idx) => {
                    const tag = `${selectedMod}-${game.numbers.join(",")}`;
                    const isSaved = savedIds.includes(tag);
                    return (
                      <div key={idx} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col gap-3 animate-fade-up">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-extrabold text-slate-800">{idx === 0 ? "★ JOGO #1" : `JOGO #${idx + 1}`}</span>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                              Mira 1º e 2º Prêmio: {game.adherence_score}%
                            </span>
                            {game.antipopularity_pct && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                                Ganhar Sozinho: {game.antipopularity_pct}%
                              </span>
                            )}
                            <button
                              onClick={() => copyNumbers(game.numbers, tag)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold"
                            >
                              {copiedKey === tag ? "Copiado!" : "Copiar"}
                            </button>
                            <button
                              onClick={() => handleBacktest(game.numbers)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold"
                            >
                              Histórico
                            </button>
                            <button
                              onClick={() => saveGameToNotebook(game, tag)}
                              className="text-xs px-3 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-bold"
                            >
                              {isSaved ? "Salvo ✓" : "+ Salvar Jogo"}
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {game.numbers.map((n) => (
                            <span
                              key={n}
                              className="ball-pop w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold bg-indigo-600 text-white"
                            >
                              {String(n).padStart(2, "0")}
                            </span>
                          ))}
                          {game.secondary_numbers && (
                            <span className="ml-2 px-2.5 py-1 rounded-full text-xs bg-amber-100 border border-amber-300 text-amber-900 font-bold">
                              Trevos: {game.secondary_numbers.join(", ")}
                            </span>
                          )}
                        </div>

                        {Array.isArray(game.prize_breakdown) && game.prize_breakdown.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-slate-500">Chances por faixa:</span>
                            {game.prize_breakdown.map((p) => (
                              <span key={p.tier} className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700">
                                {p.tier}: <strong className="text-emerald-700">{p.chance}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 2: CERCAR MAIS NÚMEROS */}
        {activeTab === "closing" && (
          <div className="clean-card p-6 rounded-2xl space-y-5 animate-fade-up">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Cercar Mais Números Gastando Pouco</h2>
                <p className="text-xs text-slate-500">
                  Escolha um grupo maior ({closingPool.length} dezenas marcadas) para dividir em cartões econômicos com garantia de pontos.
                </p>
              </div>
              <button
                onClick={() => {
                  if (!calibration) return;
                  const top18 = Object.entries(calibration.number_weights)
                    .filter(([k]) => !k.startsWith("sec_") && !k.includes("_"))
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, (currentSpec?.default_bet_size || 15) + 3)
                    .map(([k]) => Number(k))
                    .sort((a, b) => a - b);
                  setClosingPool(top18);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition"
              >
                Escolher 18 Melhores Automaticamente
              </button>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-10 gap-2">
              {universe.map((num) => {
                const active = closingPool.includes(num);
                return (
                  <button
                    key={num}
                    onClick={() => setClosingPool(active ? closingPool.filter((n) => n !== num) : [...closingPool, num].sort((a, b) => a - b))}
                    className={`ball-pop py-2 rounded-xl text-sm font-bold border ${
                      active ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    {String(num).padStart(2, "0")}
                  </button>
                );
              })}
            </div>

            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Garantia Mínima de Pontos</label>
                <input type="number" value={guaranteeHits} onChange={(e) => setGuaranteeHits(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Se Acertar no Grupo</label>
                <input type="number" value={conditionHits} onChange={(e) => setConditionHits(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold" />
              </div>
              <div className="flex items-end">
                <button onClick={handleClosing} className="w-full py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition">
                  Montar Cartões do Grupo
                </button>
              </div>
            </div>

            {closingResult && (
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-indigo-700 font-extrabold">Proteção do Grupo: {closingResult.mathematical_coverage_pct}%</span>
                  <span className="font-bold">Total de Cartões: {closingResult.total_tickets}</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {closingResult.tickets.map((t, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center gap-2">
                      <span className="text-sm font-mono font-bold">{t.numbers.map((n) => String(n).padStart(2, "0")).join(" ")}</span>
                      <button onClick={() => saveGameToNotebook(t)} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold">
                        + Salvar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA 3: QUANTO APOSTAR HOJE */}
        {activeTab === "ev" && (
          <div className="grid lg:grid-cols-12 gap-6 animate-fade-up">
            <form onSubmit={handleCalculateEv} className="lg:col-span-5 clean-card p-6 rounded-2xl space-y-4">
              <h2 className="text-lg font-extrabold text-slate-900">Vale a Pena Apostar Forte Hoje?</h2>
              <p className="text-xs text-slate-500">
                Informe o prêmio acumulado e o quanto você reservou para jogar para saber quantos cartões fazer sem comprometer seu bolso.
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Valor do Prêmio Principal (R$)</label>
                <input type="number" step="1000" value={evForm.estimated_jackpot} onChange={(e) => setEvForm({ ...evForm, estimated_jackpot: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Preço de 1 Jogo (R$)</label>
                  <input type="number" step="0.5" value={evForm.ticket_cost} onChange={(e) => setEvForm({ ...evForm, ticket_cost: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Seu Saldo p/ Jogos (R$)</label>
                  <input type="number" step="10" value={evForm.bankroll} onChange={(e) => setEvForm({ ...evForm, bankroll: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold" />
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition">
                Calcular Quanto Jogar
              </button>
            </form>

            <div className="lg:col-span-7 clean-card p-6 rounded-2xl flex flex-col justify-center">
              {!evResult ? (
                <div className="text-center text-sm text-slate-400">
                  Preencha os valores ao lado e clique em Calcular Quanto Jogar.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`p-4 rounded-xl border font-bold text-sm ${evResult.ev_per_ticket > 0 ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-amber-50 border-amber-300 text-amber-900"}`}>
                    {evResult.ev_per_ticket > 0
                      ? "MOMENTO EXCELENTE: O prêmio acumulado compensa fazer mais cartões hoje!"
                      : "CONCURSO NORMAL: Jogue leve para buscar prêmios menores e guarde saldo para quando acumular."}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <span className="text-xs text-slate-500 block">Valor Recomendado Hoje</span>
                      <strong className="text-2xl font-extrabold text-emerald-700">R$ {evResult.recommended_budget}</strong>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <span className="text-xs text-slate-500 block">Quantidade Ideal de Cartões</span>
                      <strong className="text-2xl font-extrabold text-indigo-700">{evResult.recommended_tickets} jogos</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 4: MEUS JOGOS & CONFERÊNCIA AUTOMÁTICA */}
        {activeTab === "saved" && (
          <div className="clean-card p-6 rounded-2xl space-y-5 animate-fade-up">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Meus Jogos & Conferência Automática</h2>
                <p className="text-xs text-slate-500">
                  Cada bilhete mostra o dia exato do sorteio. Loterias que não correm hoje ficam bloqueadas até o sorteio oficial sair.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {auditedBets.length > 0 && (
                  <>
                    <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                      Premiados: {winnersCount} de {auditedBets.length}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-800">
                      Média: {avgHits} acertos
                    </span>
                  </>
                )}
                {savedBets.length > 0 && (
                  <button
                    onClick={() => setSavedBets([])}
                    className="inline-flex items-center gap-1 text-xs text-red-600 font-bold hover:underline ml-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpar Lista
                  </button>
                )}
              </div>
            </div>

            {savedBets.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                Você ainda não salvou nenhum jogo. Salve o Cartão Ouro ou seus jogos montados para acompanhar aqui.
              </div>
            ) : (
              <div className="space-y-4">
                {savedBets.map((bet) => {
                  const rep = bet.auditReport;
                  const sched = computeNextDrawSchedule(bet.modality);
                  const displayDate = bet.scheduleText || sched.scheduleText;
                  // Trava se o relatório vier como PENDING, se ainda não foi apurado, ou se o concurso retornado for anterior ao concurso-alvo
                  const isLocked = !rep || rep.status === "PENDING" || rep.contest_number < bet.targetContest;
                  const hitSet = new Set(!isLocked ? rep?.hits || [] : []);
                  const nearSet = new Set(!isLocked ? rep?.near_misses || [] : []);

                  return (
                    <div
                      key={bet.id}
                      className={`p-4 rounded-2xl border space-y-3 transition ${
                        isLocked
                          ? "bg-amber-50/40 border-amber-200"
                          : rep?.is_winner
                          ? "bg-emerald-50/60 border-emerald-400"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-extrabold uppercase text-indigo-700">{bet.modalityName}</span>
                          <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-bold">
                            {sched.isDaily ? "Sorteio Diário" : "Dias Específicos"}
                          </span>
                          <span className="text-slate-700 font-bold">• Concurso #{bet.targetContest}</span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-extrabold bg-white border border-slate-300 text-slate-800">
                            <CalendarClock className="w-3 h-3 text-indigo-600" />
                            Data do Sorteio: {displayDate}
                          </span>

                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                              <Lock className="w-3 h-3" />
                              Aguardando Sorteio
                            </span>
                          ) : (
                            <span
                              className={`px-3 py-0.5 rounded-full font-extrabold ${
                                rep.is_winner ? "bg-emerald-600 text-white shadow-sm" : "bg-indigo-100 text-indigo-800"
                              }`}
                            >
                              {rep.is_winner
                                ? `PARABÉNS! PREMIADO COM ${rep.hits_count} ACERTOS!`
                                : `${rep.hits_count} acertos (Conc. #${rep.contest_number})`}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleViewBetResult(bet)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                              isLocked
                                ? "bg-amber-500 hover:bg-amber-600 text-white"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white"
                            }`}
                          >
                            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            Ver Resultado
                          </button>

                          {!isLocked && (
                            <button
                              onClick={() => trainSystemWithResult(bet)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                            >
                              Recalibrar Cartão Ouro
                            </button>
                          )}

                          <button
                            onClick={() => setSavedBets(savedBets.filter((x) => x.id !== bet.id))}
                            className="px-2.5 py-1.5 rounded-xl text-xs text-slate-500 hover:bg-slate-200 font-semibold"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {bet.numbers.map((n) => {
                          let badge = "bg-white border border-slate-300 text-slate-800";
                          if (!isLocked) {
                            if (hitSet.has(n)) badge = "bg-emerald-600 text-white shadow-sm";
                            else if (nearSet.has(n)) badge = "bg-amber-400 text-slate-950 font-extrabold";
                            else badge = "bg-slate-200 text-slate-500";
                          }
                          return (
                            <span key={n} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${badge}`}>
                              {String(n).padStart(2, "0")}
                            </span>
                          );
                        })}
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 font-semibold">
                        {isLocked ? (
                          <span className="text-amber-900 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            Sorteio ainda não realizado • Previsto para {displayDate}. O resultado será liberado automaticamente após a apuração oficial.
                          </span>
                        ) : (
                          <span>
                            {rep.is_winner
                              ? `Parabéns pelo resultado! Você cravou ${rep.hits_count} dezenas neste concurso.`
                              : rep.diagnostics.join(" ")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ABA 5: PLANOS */}
        {activeTab === "plans" && (
          <div className="grid md:grid-cols-3 gap-6 animate-fade-up">
            {[
              { tier: "free", name: "Grátis", price: "R$ 0/mês", features: ["Lotofácil e Mega-Sena", "Até 3 jogos por dia", "Conferência automática"] },
              { tier: "pro", name: "Profissional", price: "R$ 29,90/mês", highlight: true, features: ["Todas as 9 Loterias", "Até 50 jogos por dia", "Cercar até 19 dezenas"] },
              { tier: "elite", name: "Bolão Elite", price: "R$ 69,90/mês", features: ["Jogos ilimitados", "Cercar até 22 dezenas", "Acesso total a todas as ferramentas"] },
            ].map((p) => (
              <div key={p.tier} className={`clean-card p-6 rounded-2xl flex flex-col justify-between ${p.highlight ? "border-indigo-600 ring-2 ring-indigo-600/20" : ""}`}>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">{p.name}</h3>
                  <div className="text-2xl font-extrabold text-indigo-600 my-3">{p.price}</div>
                  <ul className="space-y-2.5 text-sm text-slate-600 mt-4">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => handleUpgrade(p.tier)}
                  disabled={user.plan_tier === p.tier}
                  className="mt-6 w-full py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition"
                >
                  {user.plan_tier === p.tier ? "Seu Plano Atual" : `Escolher ${p.name}`}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL 1: BLOQUEIO DE SORTEIO AINDA NÃO REALIZADO */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="clean-card max-w-md w-full p-6 rounded-3xl space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold">
                <Lock className="w-4 h-4" />
                Sorteio Ainda Não Realizado
              </div>
              <button onClick={() => setScheduleModal(null)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <h3 className="text-xl font-extrabold text-slate-900">
              {scheduleModal.bet.modalityName} • Concurso #{scheduleModal.bet.targetContest}
            </h3>

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1.5">
              <p className="text-sm font-extrabold text-amber-950">
                {scheduleModal.report.schedule_notice}
              </p>
              <p className="text-xs text-amber-800">
                Este jogo está bloqueado para conferência até o horário oficial do sorteio. Assim que as dezenas saírem, o sistema apura e mostra o resultado automaticamente.
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-500">Suas dezenas guardadas:</span>
              <div className="flex flex-wrap gap-1.5">
                {scheduleModal.bet.numbers.map((n) => (
                  <span key={n} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold bg-indigo-600 text-white">
                    {String(n).padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={() => setScheduleModal(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition"
            >
              Entendi, Aguardar Sorteio
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: VER RESULTADO COMPLETO */}
      {resultModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="clean-card max-w-xl w-full p-6 rounded-3xl space-y-5 animate-fade-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold uppercase text-indigo-600">{resultModal.bet.modalityName}</span>
                <h3 className="text-xl font-extrabold text-slate-900">
                  Resultado Oficial • Concurso #{resultModal.report.contest_number}
                </h3>
                <p className="text-xs text-slate-500">Sorteado em {resultModal.report.draw_date}</p>
              </div>
              <button onClick={() => setResultModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className={`p-4 rounded-2xl border text-sm font-extrabold flex items-center gap-3 ${resultModal.report.is_winner ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-indigo-50 border-indigo-200 text-indigo-900"}`}>
              {resultModal.report.is_winner && <PartyPopper className="w-6 h-6 text-emerald-600 shrink-0" />}
              <span>
                {resultModal.report.is_winner
                  ? `PARABÉNS! Bilhete premiado com ${resultModal.report.hits_count} acertos!`
                  : `Você fez ${resultModal.report.hits_count} acertos neste concurso.`}
              </span>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-extrabold text-slate-700 block">Dezenas Sorteadas:</span>
              <div className="flex flex-wrap gap-1.5">
                {resultModal.report.drawn_numbers.map((n) => {
                  const matched = resultModal.report.hits.includes(n);
                  return (
                    <span
                      key={n}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold ${
                        matched ? "bg-emerald-600 text-white ring-2 ring-emerald-300" : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      {String(n).padStart(2, "0")}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-extrabold text-slate-700 block">
                Seu Jogo (Verde = Acertou • Amarelo = Passou raspando por 1 número):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {resultModal.bet.numbers.map((n) => {
                  const isHit = resultModal.report.hits.includes(n);
                  const isNear = resultModal.report.near_misses.includes(n);
                  return (
                    <span
                      key={n}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold ${
                        isHit
                          ? "bg-emerald-600 text-white"
                          : isNear
                          ? "bg-amber-400 text-slate-950"
                          : "bg-slate-100 border border-slate-300 text-slate-500"
                      }`}
                    >
                      {String(n).padStart(2, "0")}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-semibold">
              {resultModal.report.diagnostics.join(" ")}
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                onClick={() => trainSystemWithResult(resultModal.bet)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition"
              >
                Usar Este Resultado p/ Melhorar o Cartão Ouro
              </button>
              <button
                onClick={() => setResultModal(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {backtestModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="clean-card max-w-md w-full p-6 rounded-2xl space-y-4 animate-fade-up">
            <h3 className="text-lg font-extrabold text-slate-900">Histórico nos Sorteios Anteriores</h3>
            <p className="text-xs text-slate-500">
              Desempenho destas dezenas nos últimos <strong>{backtestModal.total_contests_checked}</strong> concursos:
            </p>
            <div className="space-y-1.5">
              {Object.entries(backtestModal.hit_distribution).map(([hits, count]) => (
                <div key={hits} className="flex justify-between text-sm px-3.5 py-2 rounded-xl bg-slate-100">
                  <span className="font-semibold">{hits} acertos</span>
                  <span className="font-extrabold text-indigo-700">{count} vezes</span>
                </div>
              ))}
            </div>
            <button onClick={() => setBacktestModal(null)} className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm">
              Fechar
            </button>
          </div>
        </div>
      )}

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 px-4">
        LotoQuant — Jogos inteligentes, fechamentos e conferência automática.
      </footer>
    </div>
  );
}
