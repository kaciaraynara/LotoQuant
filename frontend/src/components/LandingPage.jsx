import { useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Trophy,
  Target,
  Layers,
  BellRing,
  Star,
} from "lucide-react";

export default function LandingPage({
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  authError,
  handleAuth,
}) {
  const [selectedPreview, setSelectedPreview] = useState("lotofacil");

  const previews = {
    lotofacil: {
      title: "Lotofácil • Cartão Ouro",
      badge: "99% dos jogos comuns eliminados",
      balls: [1, 3, 5, 7, 8, 10, 11, 13, 14, 16, 17, 19, 20, 23, 25],
      highlight: "Alta chance de 11, 12 e 13 pontos + mira nos 14 e 15",
    },
    megasena: {
      title: "Mega-Sena • Combinação Única",
      badge: "Baixíssimo risco de dividir prêmio",
      balls: [7, 14, 23, 34, 46, 58],
      highlight: "Foge de datas de aniversário e sequências óbvias",
    },
    quina: {
      title: "Quina • Seleção Equilibrada",
      badge: "Base oficial atualizada diariamente",
      balls: [9, 22, 37, 54, 71],
      highlight: "Distribuição inteligente entre pares, ímpares e faixas",
    },
  };

  const current = previews[selectedPreview];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Barra Superior */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black shadow-sm">
              LQ
            </div>
            <span className="text-xl font-extrabold tracking-tight text-slate-900">
              Loto<span className="text-indigo-600">Quant</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#como-funciona" className="hover:text-indigo-600 transition">Como Funciona</a>
            <a href="#diferenciais" className="hover:text-indigo-600 transition">Por que é Diferente</a>
            <a href="#acesso" className="hover:text-indigo-600 transition">Começar Grátis</a>
          </nav>

          <a
            href="#acesso"
            onClick={() => setAuthMode("login")}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-indigo-600 transition"
          >
            Entrar no Sistema
          </a>
        </div>
      </header>

      {/* Hero Section + Ilustração Interativa */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-6 animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              Inteligência aplicada aos resultados oficiais da Caixa
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight tracking-tight">
              Pare de jogar no escuro. Aposte com{" "}
              <span className="text-indigo-600">estratégia real</span> todos os dias.
            </h1>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
              O <strong>LotoQuant</strong> analisa os sorteios anteriores, elimina as combinações
              fracas que quase nunca saem e entrega os jogos mais fortes do dia prontos para você
              marcar e conferir automaticamente.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a
                href="#acesso"
                onClick={() => setAuthMode("register")}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition"
              >
                Criar Conta Grátis Agora
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#como-funciona"
                className="px-6 py-3.5 rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition"
              >
                Ver Como Funciona
              </a>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200 text-xs">
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Resultados Oficiais</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Conferência Sozinha</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <Trophy className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>9 Loterias Disponíveis</span>
              </div>
            </div>
          </div>

          {/* Ilustração Lúdica e Interativa do Volante Inteligente */}
          <div className="lg:col-span-6 animate-float">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-indigo-100 shadow-xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  {[
                    { id: "lotofacil", label: "Lotofácil" },
                    { id: "megasena", label: "Mega-Sena" },
                    { id: "quina", label: "Quina" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedPreview(item.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        selectedPreview === item.id
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {current.badge}
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-emerald-50 border border-indigo-200 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                    {current.title}
                  </span>
                  <span className="text-xs font-bold text-indigo-700">Pronto para jogar</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {current.balls.map((n) => (
                    <span
                      key={n}
                      className="ball-pop w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold bg-indigo-600 text-white shadow-sm cursor-default"
                    >
                      {String(n).padStart(2, "0")}
                    </span>
                  ))}
                </div>

                <div className="text-xs font-semibold text-emerald-800 bg-emerald-100/70 px-3 py-2 rounded-xl">
                  {current.highlight}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Economia Inteligente</span>
                  <strong className="text-slate-900 text-sm">Cerca mais dezenas gastando menos</strong>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Acompanhamento Real</span>
                  <strong className="text-slate-900 text-sm">Avisa sozinho quando você ganha</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como Funciona (3 Passos Simples) */}
      <section id="como-funciona" className="bg-white border-y border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              Simples, Visual e Direto
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900">
              Como o LotoQuant trabalha por você
            </h2>
            <p className="text-sm text-slate-500">
              Você não precisa entender de contas complexas. O painel mostra tudo pronto em 3 passos.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Target,
                step: "Passo 1",
                title: "Escolha sua Loteria",
                desc: "Lotofácil, Mega-Sena, Quina, Lotomania e outras 5 modalidades com os resultados oficiais sempre em dia.",
              },
              {
                icon: Layers,
                step: "Passo 2",
                title: "Pegue o Cartão Ouro ou Monte o Seu",
                desc: "Use a sugestão mais forte do dia com um clique ou fixe seus números da sorte enquanto o sistema equilibra o resto.",
              },
              {
                icon: BellRing,
                step: "Passo 3",
                title: "Salve e Confira Automaticamente",
                desc: "Assim que sai o sorteio da Caixa, o sistema pinta em verde seus acertos, mostra os prêmios e melhora os próximos jogos.",
              },
            ].map((card) => (
              <div key={card.step} className="clean-card p-6 rounded-2xl space-y-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <card.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-indigo-600 uppercase">{card.step}</span>
                <h3 className="text-lg font-bold text-slate-900">{card.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seção de Acesso / Cadastro */}
      <section id="acesso" className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid lg:grid-cols-12 gap-10 items-center bg-white rounded-3xl p-6 sm:p-10 border border-slate-200 shadow-sm">
          <div id="diferenciais" className="lg:col-span-6 space-y-5">
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
              Acesso Imediato
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900">
              Comece gratuitamente e teste seus jogos hoje mesmo
            </h2>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span><strong>Cartão Ouro Diário:</strong> a combinação mais equilibrada pronta todo dia.</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span><strong>Fuga de Rateio:</strong> evita jogos óbvios que milhares de pessoas marcam iguais.</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span><strong>Caderno Inteligente:</strong> guarda seus volantes e confere sozinho após o sorteio.</span>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-6">
            <div className="bg-slate-50 rounded-2xl p-6 sm:p-8 border border-slate-200 max-w-md mx-auto">
              <div className="flex gap-2 mb-6 bg-white p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                    authMode === "login" ? "bg-indigo-600 text-white" : "text-slate-600"
                  }`}
                >
                  Já Tenho Conta
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("register")}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                    authMode === "register" ? "bg-indigo-600 text-white" : "text-slate-600"
                  }`}
                >
                  Criar Conta Grátis
                </button>
              </div>

              {authError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuth} className="space-y-4">
                {authMode === "register" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Seu Nome</label>
                    <input
                      type="text"
                      required
                      placeholder="Como deseja ser chamado"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm outline-none focus:border-indigo-600"
                      value={authForm.full_name}
                      onChange={(e) => setAuthForm({ ...authForm, full_name: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Seu E-mail</label>
                  <input
                    type="email"
                    required
                    placeholder="seuemail@exemplo.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm outline-none focus:border-indigo-600"
                    value={authForm.email}
                    onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sua Senha</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm outline-none focus:border-indigo-600"
                    value={authForm.password}
                    onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition"
                >
                  {authMode === "login" ? "Acessar Meu Painel" : "Criar Conta e Começar"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 mt-auto">
        LotoQuant — Plataforma de jogos inteligentes, fechamentos e conferência automática.
      </footer>
    </div>
  );
}
