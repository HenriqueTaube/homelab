import { useState } from 'react';
import './styles.css';

// ── helpers de estado ──────────────────────────────────────────────────────────
const newItem = () => ({
  titulo: '',
  escopo: [{ qtd: '01', produto: '' }],
  dadosAplicacao: [{ campo: '', valor: '' }],
  caracteristicas: [{ componente: '', descricao: '' }],
  recursosOperacionais: [''],
  beneficiosOperacionais: [''],
});

const newInv = () => ({ qtd: '01', valorUnit: '' });

// ── helpers de valor ──────────────────────────────────────────────────────────
const parseVal = (s = '') => {
  const n = parseFloat(String(s).replace(/[R$\s.]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
const formatVal = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ── componentes de linhas dinâmicas ───────────────────────────────────────────
function ScopeRows({ rows, onChange }) {
  const add    = () => onChange([...rows, { qtd: '01', produto: '' }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const upd    = (i, k, v) => onChange(rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  return (
    <div className="dyn-rows">
      {rows.map((row, i) => (
        <div key={i} className="dyn-row">
          <input
            className="input input-sm"
            placeholder="Qtd"
            value={row.qtd}
            onChange={e => upd(i, 'qtd', e.target.value)}
          />
          <input
            className="input input-grow"
            placeholder="Produto / componente"
            value={row.produto}
            onChange={e => upd(i, 'produto', e.target.value)}
          />
          <button className="btn-x" onClick={() => remove(i)} disabled={rows.length === 1} title="Remover">×</button>
        </div>
      ))}
      <button className="btn-add" onClick={add}>+ linha</button>
    </div>
  );
}

function KVRows({ rows, onChange, ph = ['Campo', 'Valor'] }) {
  const add    = () => onChange([...rows, { campo: '', valor: '' }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const upd    = (i, k, v) => onChange(rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  return (
    <div className="dyn-rows">
      {rows.map((row, i) => (
        <div key={i} className="dyn-row">
          <input
            className="input input-kv-key"
            placeholder={ph[0]}
            value={row.campo}
            onChange={e => upd(i, 'campo', e.target.value)}
          />
          <input
            className="input input-grow"
            placeholder={ph[1]}
            value={row.valor}
            onChange={e => upd(i, 'valor', e.target.value)}
          />
          <button className="btn-x" onClick={() => remove(i)} disabled={rows.length === 1} title="Remover">×</button>
        </div>
      ))}
      <button className="btn-add" onClick={add}>+ linha</button>
    </div>
  );
}

function BulletRows({ rows, onChange, placeholder }) {
  const add    = () => onChange([...rows, '']);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const upd    = (i, v) => onChange(rows.map((r, idx) => idx === i ? v : r));

  return (
    <div className="dyn-rows">
      {rows.map((row, i) => (
        <div key={i} className="dyn-row">
          <span className="bullet-dot">•</span>
          <input
            className="input input-grow"
            placeholder={placeholder}
            value={row}
            onChange={e => upd(i, e.target.value)}
          />
          <button className="btn-x" onClick={() => remove(i)} disabled={rows.length === 1} title="Remover">×</button>
        </div>
      ))}
      <button className="btn-add" onClick={add}>+ linha</button>
    </div>
  );
}

// ── seção de um item ───────────────────────────────────────────────────────────
function ItemSection({ idx, item, onChange }) {
  const upd = (key, val) => onChange({ ...item, [key]: val });
  const num = String(idx + 1).padStart(2, '0');

  return (
    <section className="card item-card">
      <div className="item-card-header">
        <span className="item-badge">ITEM {num}</span>
      </div>

      <div className="field-group">
        <label className="field-label">Título do Item</label>
        <input
          className="input"
          placeholder="Ex: Apalpador Pneumático TB Axial"
          value={item.titulo}
          onChange={e => upd('titulo', e.target.value)}
        />
      </div>

      <div className="field-group">
        <label className="field-label">Quantidade / Escopo</label>
        <ScopeRows rows={item.escopo} onChange={v => upd('escopo', v)} />
      </div>

      <div className="field-group">
        <label className="field-label">Dados de Aplicação</label>
        <KVRows rows={item.dadosAplicacao} onChange={v => upd('dadosAplicacao', v)} />
      </div>

      <div className="field-group">
        <label className="field-label">Características Construtivas</label>
        <KVRows
          rows={item.caracteristicas}
          onChange={v => upd('caracteristicas', v)}
          ph={['Componente', 'Descrição construtiva']}
        />
      </div>

      <div className="field-group">
        <label className="field-label">Recursos Operacionais</label>
        <BulletRows
          rows={item.recursosOperacionais}
          onChange={v => upd('recursosOperacionais', v)}
          placeholder="Recurso operacional"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Benefícios Operacionais</label>
        <BulletRows
          rows={item.beneficiosOperacionais}
          onChange={v => upd('beneficiosOperacionais', v)}
          placeholder="Benefício operacional"
        />
      </div>
    </section>
  );
}

// ── app principal ──────────────────────────────────────────────────────────────
export function App() {
  const [cliente, setCliente]       = useState({ nome: '', telefone: '', contato: '', email: '', endereco: '' });
  const [numItens, setNumItens]     = useState(1);
  const [apresentacao, setApresentacao] = useState('');
  const [objetivo, setObjetivo]     = useState('');
  const [itens, setItens]           = useState([newItem()]);
  const [investimentos, setInvestimentos] = useState([newInv()]);
  const [prazo, setPrazo]           = useState('');
  const [condicao, setCondicao]     = useState('');
  const [startup, setStartup]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [resposta, setResposta]     = useState({ mensagem: '', blob: null, nome: '' });

  const handleNumItens = (n) => {
    setNumItens(n);
    setItens(prev =>
      n > prev.length
        ? [...prev, ...Array(n - prev.length).fill(null).map(newItem)]
        : prev.slice(0, n)
    );
    setInvestimentos(prev =>
      n > prev.length
        ? [...prev, ...Array(n - prev.length).fill(null).map(newInv)]
        : prev.slice(0, n)
    );
  };

  const updateItem = (idx, val) =>
    setItens(prev => prev.map((it, i) => i === idx ? val : it));

  const updateInv = (idx, k, v) =>
    setInvestimentos(prev => prev.map((inv, i) => i === idx ? { ...inv, [k]: v } : inv));

  const grandTotal = investimentos.reduce(
    (sum, inv) => sum + parseVal(inv.qtd) * parseVal(inv.valorUnit), 0
  );

  const handleDownload = () => {
    if (!resposta.blob) return;
    const url = URL.createObjectURL(resposta.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = resposta.nome || 'proposta.docx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGerar = async () => {
    setLoading(true);
    setResposta({ mensagem: '', blob: null, nome: '' });
    const payload = {
      cliente, apresentacao, objetivo, itens,
      investimentos, grandTotal: formatVal(grandTotal),
      prazo, condicao, startup,
    };
    try {
      const res = await fetch('/api/gerar-proposta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
      const data = await res.json();
      // Espera: { message: string, docx_base64: string, filename: string }
      const bytes = atob(data.docx_base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      setResposta({ mensagem: data.message, blob, nome: data.filename || 'proposta.docx' });
    } catch (err) {
      setResposta({ mensagem: `Erro ao gerar proposta: ${err.message}`, blob: null, nome: '' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">

      <header className="app-header">
        <div className="header-inner">
          <img src="/assets/logo-taube-minizado.jpg" alt="Taube Equipamentos" className="header-logo" />
          <div className="header-text">
            <span className="header-title">TAUBE EQUIPAMENTOS</span>
            <span className="header-sub">Gerador de Proposta Comercial</span>
          </div>
        </div>
      </header>

      <main className="app-main">

        {/* ── Dados do cliente ── */}
        <section className="card">
          <h2 className="card-title">Dados do Cliente</h2>
          <div className="grid-2">
            <div className="field-group">
              <label className="field-label">Empresa</label>
              <input className="input" placeholder="Nome da empresa" value={cliente.nome}
                onChange={e => setCliente({ ...cliente, nome: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">Telefone</label>
              <input className="input" placeholder="(XX) XXXXX-XXXX" value={cliente.telefone}
                onChange={e => setCliente({ ...cliente, telefone: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">Nome do Contato</label>
              <input className="input" placeholder="Nome do responsável" value={cliente.contato}
                onChange={e => setCliente({ ...cliente, contato: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">E-mail</label>
              <input className="input" type="email" placeholder="email@empresa.com.br" value={cliente.email}
                onChange={e => setCliente({ ...cliente, email: e.target.value })} />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Endereço</label>
            <input className="input" placeholder="Rua, número, cidade – UF" value={cliente.endereco}
              onChange={e => setCliente({ ...cliente, endereco: e.target.value })} />
          </div>
        </section>

        {/* ── Quantidade de itens ── */}
        <section className="card">
          <h2 className="card-title">Quantidade de Itens na Proposta</h2>
          <div className="num-selector">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                className={`num-btn ${numItens === n ? 'active' : ''}`}
                onClick={() => handleNumItens(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        {/* ── Apresentação ── */}
        <section className="card">
          <h2 className="card-title">
            <span className="section-num">1.</span> Apresentação
          </h2>
          <div className="field-group">
            <label className="field-label">Contexto da proposta</label>
            <textarea
              className="textarea"
              rows={4}
              placeholder="Descreva o contexto. A IA vai elaborar o texto completo com base no que você escrever aqui."
              value={apresentacao}
              onChange={e => setApresentacao(e.target.value)}
            />
          </div>
        </section>

        {/* ── Objetivo ── */}
        <section className="card">
          <h2 className="card-title">
            <span className="section-num">2.</span> Objetivo
          </h2>
          <div className="field-group">
            <label className="field-label">Objetivo da proposta</label>
            <textarea
              className="textarea"
              rows={4}
              placeholder="Descreva o objetivo. A IA vai elaborar o texto completo com base no que você escrever aqui."
              value={objetivo}
              onChange={e => setObjetivo(e.target.value)}
            />
          </div>
        </section>

        {/* ── Itens ── */}
        {itens.map((item, idx) => (
          <ItemSection key={idx} idx={idx} item={item} onChange={val => updateItem(idx, val)} />
        ))}

        {/* ── Investimento ── */}
        <section className="card">
          <h2 className="card-title">Investimento</h2>
          <div className="inv-header">
            <span className="inv-col-item">Item</span>
            <span className="inv-col-sm">Qtd.</span>
            <span className="inv-col-val">Valor Unit.</span>
            <span className="inv-col-val">Total</span>
          </div>
          {investimentos.map((inv, idx) => {
            const total = parseVal(inv.qtd) * parseVal(inv.valorUnit);
            return (
              <div key={idx} className="dyn-row inv-row">
                <span className="inv-col-item inv-item-label">
                  Item {String(idx + 1).padStart(2, '0')}
                </span>
                <input
                  className="input inv-col-sm"
                  placeholder="01"
                  value={inv.qtd}
                  onChange={e => updateInv(idx, 'qtd', e.target.value)}
                />
                <input
                  className="input inv-col-val"
                  placeholder="R$ 0,00"
                  value={inv.valorUnit}
                  onChange={e => updateInv(idx, 'valorUnit', e.target.value)}
                />
                <span className="inv-val-display inv-col-val">
                  {total > 0 ? formatVal(total) : '—'}
                </span>
              </div>
            );
          })}
          <div className="inv-total-row">
            <span className="inv-total-label">TOTAL DA PROPOSTA</span>
            <span className="inv-total-val">
              {grandTotal > 0 ? formatVal(grandTotal) : '—'}
            </span>
          </div>
        </section>

        {/* ── Prazo de Entrega ── */}
        <section className="card">
          <h2 className="card-title">Prazo de Entrega</h2>
          <div className="field-group">
            <textarea
              className="textarea"
              rows={3}
              placeholder="Ex: Item 01: 30 dias corridos após confirmação do pedido."
              value={prazo}
              onChange={e => setPrazo(e.target.value)}
            />
          </div>
        </section>

        {/* ── Dados Complementares ── */}
        <section className="card">
          <h2 className="card-title">Dados Complementares</h2>
          <div className="comp-table">
            <div className="comp-row comp-row-fixed">
              <span className="comp-key">Frete</span>
              <span className="comp-val">FOB</span>
            </div>
            <div className="comp-row comp-row-fixed">
              <span className="comp-key">Impostos</span>
              <span className="comp-val">Simples Nacional</span>
            </div>
            <div className="comp-row">
              <span className="comp-key">Acompanhamento Startup</span>
              <input
                className="input"
                placeholder="Ex: incluso, 2 dias, sob consulta..."
                value={startup}
                onChange={e => setStartup(e.target.value)}
              />
            </div>
            <div className="comp-row comp-row-fixed">
              <span className="comp-key">Montagem</span>
              <span className="comp-val">Excluída do escopo do fornecimento</span>
            </div>
          </div>
        </section>

        {/* ── Condição de Pagamento ── */}
        <section className="card">
          <h2 className="card-title">Condição de Pagamento</h2>
          <div className="field-group">
            <textarea
              className="textarea"
              rows={3}
              placeholder="Ex: 30% no pedido, saldo em 28/45 DDL."
              value={condicao}
              onChange={e => setCondicao(e.target.value)}
            />
          </div>
        </section>

        {/* ── Ação ── */}
        <div className="actions">
          <button className="btn-gerar" onClick={handleGerar} disabled={loading}>
            {loading ? 'Aguarde, gerando proposta...' : 'Gerar Proposta (.docx)'}
          </button>
        </div>

        {/* ── Retorno da IA ── */}
        <section className="card resposta-card">
          <h2 className="card-title">Retorno da IA</h2>
          <div className="resposta-box">
            {loading
              ? <span className="resposta-loading">Processando proposta...</span>
              : <p className="resposta-texto">{resposta.mensagem || 'Aguardando...'}</p>
            }
          </div>
          {resposta.blob && (
            <button className="btn-download" onClick={handleDownload}>
              Baixar Proposta (.docx)
            </button>
          )}
        </section>

      </main>
    </div>
  );
}
