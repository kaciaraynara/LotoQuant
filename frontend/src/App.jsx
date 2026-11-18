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
  BellRing,
} from "lucide-react";
import { api } from "./services/api";
import LandingPage from "./components/LandingPage";

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
        setSavedBets((prev) =>
          prev.map((item) => {
            const rep = res.results[String(item.id)];
            return rep ? { ...item, auditReport: rep } : item;
          })
        );
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
    setStatusAlert({ type: "info", text: "Atualizando resultados oficiais da Caixa e conferindo seus jogos..." });
    try {
      const syncRes = await api.syncModality(modSlug, 50);
      const cal = await api.getCalibration(modSlug);
      setCalibration(cal);
      await loadIdealDailyPick(modSlug);
      await runAutoCheckAll(savedBets);
      setStatusAlert({
        type: "success",
        text: `Base atualizada! Último sorteio oficial: Concurso #${syncRes.reference_contest}.`,
      });
    } catch (err) {
      setStatusAlert({ type: "error", text: `Não foi possível atualizar agora: ${err.message}` });
    } finally {
      setSyncing(false);
    }
  }

  function toggleNumberFilter(num) {
    if (fixedNums.includes(num)) {
      setFixedNums(fixedNums.filter((n) => n !== num));
      setExcludedNums([...excludedNums, num]);
    } else if (excludedNums.includes(num)) {
      setExcludedNums(excludedNums.filter((n) => n !== num));
    } else {
      setFixedNums([...fixedNums, num]);
    }
  }

  function copyNumbers(numbers, tag) {
    const text = numbers.map((n) => String(n).padStart(2, "0")).join(" - ");
    navigator.clipboard.writeText(text);
    setCopiedKey(tag);
    setTimeout(() => setCopiedKey(""), 2200);
  }

  async function handleGenerate(autoSmart = false) {
    setLoadingGen(true);
    setStatusAlert(null);
    try {
      let fixed = fixedNums;
      let excluded = excludedNums;

      if (autoSmart && calibration?.number_weights) {
        const ranked = Object.entries(calibration.number_weights)
          .filter(([k]) => !k.startsWith("sec_") && !k.includes("_"))
          .sort((a, b) => b[1] - a[1])
          .map(([k]) => Number(k));
        const fixCount = currentSpec?.drawn_count >= 15 ? 4 : 2;
        fixed = ranked.slice(0, fixCount);
        excluded = ranked.slice(-5);
        setFixedNums(fixed);
        setExcludedNums(excluded);
      }

      const res = await api.generate({
        modality: selectedMod,
        quantity: Number(quantity),
        fixed_numbers: fixed,
        excluded_numbers: excluded,
      });

      const gamesList = Array.isArray(res?.games) ? res.games : [];
      setGeneratedGames(gamesList);
      if (gamesList.length > 0 && gamesList[0].antipopularity_pct) {
        setEvForm((prev) => ({ ...prev, antipopularity_pct: gamesList[0].antipopularity_pct }));
      }
      setStatusAlert({
        type: "success",
        text: `Pronto! ${gamesList.length} jogos de alta precisão gerados para o Concurso #${res.reference_contest}.`,
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
    const entry = {
      id: `${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      modality: selectedMod,
      modalityName: currentSpec?.name || selectedMod.toUpperCase(),
      isDaily: currentSpec?.is_daily ?? false,
      drawDays: currentSpec?.draw_days || "",
      nextDrawInfo: calibration?.next_draw_info || null,
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
      text: `Jogo guardado! Veja o dia do sorteio e acompanhe na aba "Meus Jogos & Conferência".`,
    });
  }

  async function handleViewBetResult(bet) {
    try {
      const report = await api.postDrawAudit({
        modality: bet.modality,
        bet_numbers: bet.numbers,
        target_contest: bet.targetContest,
        apply_learning: false,
      });

      setSavedBets((prev) =>
        prev.map((item) => (item.id === bet.id ? { ...item, auditReport: report } : item))
      );

      if (report.status === "PENDING") {
        setScheduleModal({ bet, report });
      } else {
        setResultModal({ bet, report });
      }
    } catch (err) {
      setStatusAlert({ type: "error", text: err.message });
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
        text: `Cartão Ouro recalibrado com o resultado oficial do Concurso #${report.contest_number}!`,
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
      setStatusAlert({ type: "success", text: `Plano ${tier.toUpperCase()} ativado.` });
      setActiveTab("generator");
    } catch (err) {
      setStatusAlert({ type: "error", text: err.message });
    }
  }

  function exportCsv(games) {
    const rows = [
      ["Jogo", "Dezenas", "Forca_do_Jogo_%", "Ganhar_Sozinho_%", "Soma", "Pares"],
      ...games.map((g, i) => [
        i + 1,
        g.numbers.map((n) => String(n).padStart(2, "0")).join(" - "),
        g.adherence_score,
        g.antipopularity_pct ?? "-",
        g.metrics?.sum ?? "-",
        g.metrics?.even ?? "-",
      ]),
    ];
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jogos_${selectedMod}.csv`;
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
  const auditedBets = savedBets.filter((b) => b.auditReport && b.auditReport.status === "AUDITED");
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
        {/* Seletor de Loterias */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {modalities.map((m) => (
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
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${selectedMod === m.slug ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                {m.is_daily ? "Diário" : "Dias Específicos"}
              </span>
            </button>
          ))}
        </div>

        {/* Painel do Último Resultado Oficial + Próximo Dia de Sorteio */}
        {calibration && (
          <div className="clean-card p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 animate-fade-up">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Último Resultado Oficial
                </span>
                <span className="text-xs text-slate-700 font-extrabold">
                  Concurso #{calibration.reference_contest} ({calibration.reference_date || "Atualizado"})
                </span>
                {calibration.next_draw_info && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    <CalendarClock className="w-3.5 h-3.5" />
                    Próximo Sorteio: {calibration.next_draw_info.weekday_name} ({calibration.next_draw_info.next_date})
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 font-semibold mr-1">Bolas sorteadas:</span>
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

            <div className="flex flex-wrap gap-4 text-xs bg-slate-50 px-4 py-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 block">Soma Recomendada</span>
                <strong className="text-slate-900 text-sm">{calibration.thresholds.sum?.[0]} a {calibration.thresholds.sum?.[1]}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Números Pares</span>
                <strong className="text-indigo-700 text-sm">{calibration.thresholds.even?.[0]} a {calibration.thresholds.even?.[1]}</strong>
              </div>
              {calibration.thresholds.frame && (
                <div>
                  <span className="text-slate-500 block">Na Borda do Volante</span>
                  <strong className="text-slate-900 text-sm">{calibration.thresholds.frame?.[0]} a {calibration.thresholds.frame?.[1]}</strong>
                </div>
              )}
              <div>
                <span className="text-slate-500 block">Repetidas do Último</span>
                <strong className="text-emerald-700 text-sm">{calibration.thresholds.repeat?.[0]} a {calibration.thresholds.repeat?.[1]}</strong>
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
                  Pontos Passados
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
                  Modo Inteligente (Fixa Melhores e Tira 5 Fracas)
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 clean-card p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-slate-900">Jogos Selecionados ({generatedGames.length})</h2>
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
                  <p className="text-xs text-slate-400">Clique em "Gerar Meus Jogos" ou use o "Modo Inteligente" ao lado.</p>
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
                              Força: {game.adherence_score}%
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
                              Pontos Passados
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

                        {game.metrics && (
                          <div className="flex flex-wrap gap-4 text-xs text-slate-600 pt-2 border-t border-slate-200">
                            <span>Soma: <strong className="text-slate-900">{game.metrics.sum}</strong></span>
                            <span>Pares / Ímpares: <strong className="text-slate-900">{game.metrics.even} / {game.metrics.odd}</strong></span>
                            {game.metrics.frame !== undefined && <span>Borda: <strong className="text-slate-900">{game.metrics.frame}</strong></span>}
                            <span>Repetidas: <strong className="text-slate-900">{game.metrics.repeat_last}</strong></span>
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
                  Preencha os valores ao lado e clique em "Calcular Quanto Jogar".
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

        {/* ABA 4: MEUS JOGOS & CONFERÊNCIA AUTOMÁTICA COM TRAVA DE CALENDÁRIO */}
        {activeTab === "saved" && (
          <div className="clean-card p-6 rounded-2xl space-y-5 animate-fade-up">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Meus Jogos & Conferência Inteligente</h2>
                <p className="text-xs text-slate-500">
                  Jogos de concursos futuros ficam travados até o dia oficial do sorteio para nunca confundir você. Clique em <strong>Ver Resultado</strong> para abrir o raio-x completo.
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
                Você ainda não salvou nenhum jogo. Clique em "Salvar Cartão Ouro" ou "+ Salvar Jogo" para acompanhar aqui.
              </div>
            ) : (
              <div className="space-y-4">
                {savedBets.map((bet) => {
                  const rep = bet.auditReport;
                  const isPending = rep?.status === "PENDING";
                  const hitSet = new Set(rep?.hits || []);
                  const nearSet = new Set(rep?.near_misses || []);

                  return (
                    <div
                      key={bet.id}
                      className={`p-4 rounded-2xl border space-y-3 transition ${
                        isPending
                          ? "bg-amber-50/40 border-amber-200"
                          : rep?.is_winner
                          ? "bg-emerald-50/50 border-emerald-300"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-extrabold uppercase text-indigo-700">{bet.modalityName}</span>
                          <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-bold">
                            {bet.isDaily ? "Sorteio Diário" : "Dias Específicos"}
                          </span>
                          <span className="text-slate-600 font-semibold">• Concurso #{bet.targetContest}</span>

                          {isPending ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                              <Lock className="w-3 h-3" />
                              Travado • Sorteio {rep.weekday_name} ({rep.draw_date})
                            </span>
                          ) : rep ? (
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-extrabold ${
                                rep.is_winner ? "bg-emerald-600 text-white" : "bg-indigo-100 text-indigo-800"
                              }`}
                            >
                              {rep.is_winner
                                ? `PREMIADO: ${rep.hits_count} acertos!`
                                : `${rep.hits_count} acertos (Conc. #${rep.contest_number})`}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleViewBetResult(bet)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                              isPending
                                ? "bg-amber-500 hover:bg-amber-600 text-white"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white"
                            }`}
                          >
                            {isPending ? <BellRing className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            {isPending ? "Ver Data do Sorteio" : "Ver Resultado"}
                          </button>

                          {!isPending && rep && (
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
                          if (rep && !isPending) {
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

                      {rep && (
                        <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 font-semibold">
                          {isPending ? (
                            <span className="text-amber-900 flex items-center gap-1.5">
                              <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
                              {rep.schedule_notice} O sistema desbloqueia a conferência automaticamente após o sorteio da Caixa.
                            </span>
                          ) : (
                            <span>{rep.diagnostics.join(" ")}</span>
                          )}
                        </div>
                      )}
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

      {/* MODAL 1: NOTIFICAÇÃO DE DATA DO SORTEIO (JOGO TRAVADO) */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="clean-card max-w-md w-full p-6 rounded-3xl space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold">
                <CalendarClock className="w-4 h-4" />
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
                Para evitar qualquer confusão, este bilhete fica travado até a Caixa divulgar as dezenas oficiais. Assim que o sorteio ocorrer, clique em <strong>Atualizar Resultados</strong> e depois em <strong>Ver Resultado</strong>.
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-500">Suas dezenas guardadas para este concurso:</span>
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

      {/* MODAL 2: VER RESULTADO COMPLETO (LADO A LADO) */}
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

            <div className={`p-4 rounded-2xl border text-sm font-extrabold ${resultModal.report.is_winner ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-indigo-50 border-indigo-200 text-indigo-900"}`}>
              {resultModal.report.is_winner
                ? `PARABÉNS! Bilhete premiado com ${resultModal.report.hits_count} acertos!`
                : `Você fez ${resultModal.report.hits_count} acertos neste concurso.`}
            </div>

            <div className="space-y-2">
              <span className="text-xs font-extrabold text-slate-700 block">Bolas Sorteadas pela Caixa:</span>
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

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex flex-wrap gap-4 text-slate-600">
                <span>Soma do Jogo: <strong>{resultModal.report.comparison.bet_sum}</strong> (Sorteio: <strong>{resultModal.report.comparison.drawn_sum}</strong>)</span>
                <span>Pares: <strong>{resultModal.report.comparison.bet_even}</strong> (Sorteio: <strong>{resultModal.report.comparison.drawn_even}</strong>)</span>
              </div>
              <p className="text-slate-700 font-semibold pt-1 border-t border-slate-200">
                {resultModal.report.diagnostics.join(" ")}
              </p>
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
            <h3 className="text-lg font-extrabold text-slate-900">Desempenho nos Sorteios Anteriores</h3>
            <p className="text-xs text-slate-500">
              Se você tivesse jogado essas dezenas nos últimos <strong>{backtestModal.total_contests_checked}</strong> concursos:
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
