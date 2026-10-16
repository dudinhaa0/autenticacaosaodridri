import { useEffect, useRef, useState } from 'react';
import { useAuth } from './contexts/AuthContext.jsx';
import * as faceapi from 'face-api.js';
import { supabase } from './services/supabaseClient';

// Modelos pré-treinados do face-api.js, carregados do CDN em tempo de execução
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
const DISTANCIA_MAXIMA = 0.55; // quanto menor, mais rígida a comparação (0.4~0.6 é o normal)

const FUNC_VAZIO = {
  nome: '', cargo: '', setor: '', email: '', telefone: '', status: 'Ativo',
};

function Dashboard() {
  // ===== NAV / LAYOUT =====
  const [activeTab, setActiveTab] = useState('ponto');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [horaAtual, setHoraAtual] = useState('00:00:00');

  // ===== DADOS =====
  const [funcionarios, setFuncionarios] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  // ===== SELEÇÃO / DETALHES =====
  const [selecionadoId, setSelecionadoId] = useState(null);

  // ===== BUSCA (tab Listar) =====
  const [busca, setBusca] = useState('');

  // ===== FORM CADASTRO =====
  const [form, setForm] = useState(FUNC_VAZIO);
  const [fotoData, setFotoData] = useState(null);
  const [fotoDescriptor, setFotoDescriptor] = useState(null); // "assinatura" facial da foto (128 números)
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [calculandoRosto, setCalculandoRosto] = useState(false);

  // Modelos de IA (face-api.js)
  const [modelosProntos, setModelosProntos] = useState(false);
  const [modelosErro, setModelosErro] = useState(null);

  // Câmera cadastro
  const videoCadastroRef = useRef(null);
  const streamCadastroRef = useRef(null);
  const [cameraCadastroOn, setCameraCadastroOn] = useState(false);
  const uploadInputRef = useRef(null);

  // Câmera ponto
  const videoPontoRef = useRef(null);
  const overlayRef = useRef(null);
  const streamPontoRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const [cameraPontoOn, setCameraPontoOn] = useState(false);
  const [pontoDotClass, setPontoDotClass] = useState('detection-dot');
  const [pontoText, setPontoText] = useState('Clique em "Iniciar" para começar');
  const [pontoStatus, setPontoStatus] = useState('⚪ Aguardando');
  const [mostrarSelecao, setMostrarSelecao] = useState(false);
  const [registroOverlay, setRegistroOverlay] = useState(null); // { func, tipo, mensagem, hora }
  const [naoEncontrado, setNaoEncontrado] = useState(null); // mensagem

  // ===== CARREGAR MODELOS DE IA (face-api.js) =====
  useEffect(() => {
    async function carregarModelos() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelosProntos(true);
      } catch (err) {
        console.error('Erro ao carregar modelos de reconhecimento facial:', err);
        setModelosErro(err.message);
      }
    }
    carregarModelos();
  }, []);

  // Calcula a "assinatura" facial (128 números) a partir de uma imagem (dataURL)
  async function calcularDescriptor(dataUrl) {
    if (!modelosProntos) return null;
    setCalculandoRosto(true);
    try {
      const img = await faceapi.fetchImage(dataUrl);
      const deteccao = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
      return deteccao ? Array.from(deteccao.descriptor) : null;
    } catch (err) {
      console.error('Erro ao calcular rosto:', err);
      return null;
    } finally {
      setCalculandoRosto(false);
    }
  }

  // ===== RELÓGIO =====
  useEffect(() => {
    const id = setInterval(() => {
      setHoraAtual(new Date().toLocaleTimeString('pt-BR'));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ===== CARREGAR DADOS DO SUPABASE =====
  async function carregarDados() {
    try {
      setCarregando(true);
      setErro(null);
      const [{ data: func, error: erroFunc }, { data: reg, error: erroReg }] = await Promise.all([
        supabase.from('funcionarios').select('*').order('nome', { ascending: true }),
        supabase.from('registros').select('*').order('id', { ascending: true }),
      ]);
      if (erroFunc) throw erroFunc;
      if (erroReg) throw erroReg;
      setFuncionarios(func || []);
      setRegistros(reg || []);
    } catch (err) {
      console.error('Erro ao carregar dados:', err.message);
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== HELPERS =====
  const funcionarioSelecionado = funcionarios.find((f) => f.id === selecionadoId) || null;

  function switchTab(tab) {
    setActiveTab(tab);
    setSidebarOpen(false);
    if (tab !== 'ponto') {
      pararCameraPonto();
    }
    if (tab !== 'cadastrar') {
      pararCameraCadastro();
    }
  }

  const funcionariosFiltrados = funcionarios.filter((f) => {
    const termo = busca.toLowerCase();
    return (
      f.nome?.toLowerCase().includes(termo) ||
      f.cargo?.toLowerCase().includes(termo) ||
      (f.setor || '').toLowerCase().includes(termo)
    );
  });

  // ===== CÂMERA — CADASTRO =====
  async function iniciarCameraCadastro() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamCadastroRef.current = stream;
      if (videoCadastroRef.current) {
        videoCadastroRef.current.srcObject = stream;
      }
      setCameraCadastroOn(true);
      setFotoData(null);
    } catch (err) {
      alert('⚠️ Não foi possível acessar a câmera: ' + err.message);
    }
  }

  function pararCameraCadastro() {
    if (streamCadastroRef.current) {
      streamCadastroRef.current.getTracks().forEach((t) => t.stop());
      streamCadastroRef.current = null;
    }
    setCameraCadastroOn(false);
  }

  async function processarNovaFoto(dataUrl) {
    setFotoData(dataUrl);
    const descriptor = await calcularDescriptor(dataUrl);
    setFotoDescriptor(descriptor);
    if (!descriptor) {
      alert('⚠️ Não consegui identificar um rosto nessa foto. O cadastro será salvo, mas o reconhecimento automático não vai funcionar para essa pessoa — tente outra foto com o rosto bem visível.');
    }
  }

  function capturarFoto() {
    const video = videoCadastroRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    processarNovaFoto(canvas.toDataURL('image/jpeg', 0.85));
    pararCameraCadastro();
  }

  function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      processarNovaFoto(ev.target.result);
      pararCameraCadastro();
    };
    reader.readAsDataURL(file);
  }

  function resetForm() {
    setForm(FUNC_VAZIO);
    setFotoData(null);
    setFotoDescriptor(null);
    setEditandoId(null);
    pararCameraCadastro();
  }

  function editarFuncionario(id) {
    const func = funcionarios.find((f) => f.id === id);
    if (!func) return;
    setActiveTab('cadastrar');
    setEditandoId(id);
    setForm({
      nome: func.nome || '', cargo: func.cargo || '', setor: func.setor || '',
      email: func.email || '', telefone: func.telefone || '', status: func.status || 'Ativo',
    });
    setFotoData(func.foto || null);
    setFotoDescriptor(func.descriptor || null);
  }

  async function excluirFuncionario(id) {
    const func = funcionarios.find((f) => f.id === id);
    if (!func) return;
    if (!confirm(`Deseja realmente excluir "${func.nome}" do sistema?`)) return;
    const { error } = await supabase.from('funcionarios').delete().eq('id', id);
    if (error) {
      alert('❌ Erro ao excluir: ' + error.message);
      return;
    }
    setFuncionarios((prev) => prev.filter((f) => f.id !== id));
    if (selecionadoId === id) setSelecionadoId(null);
    alert(`✅ Funcionário "${func.nome}" excluído!`);
  }

  async function handleSubmitForm(e) {
    e.preventDefault();
    if (!form.nome.trim() || !form.cargo.trim() || !form.email.trim()) {
      alert('⚠️ Preencha todos os campos obrigatórios!');
      return;
    }
    if (!fotoData) {
      alert('⚠️ Capture ou faça upload de uma foto!');
      return;
    }

    const payload = { ...form, foto: fotoData, descriptor: fotoDescriptor };
    setSalvando(true);
    try {
      if (editandoId) {
        const { data, error } = await supabase
          .from('funcionarios').update(payload).eq('id', editandoId).select().single();
        if (error) throw error;
        setFuncionarios((prev) => prev.map((f) => (f.id === editandoId ? data : f)));
        alert('✅ Funcionário atualizado com sucesso!');
        setSelecionadoId(editandoId);
      } else {
        const { data, error } = await supabase.from('funcionarios').insert(payload).select().single();
        if (error) throw error;
        setFuncionarios((prev) => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
        alert('✅ Funcionário cadastrado com sucesso!');
        setSelecionadoId(data.id);
      }
      resetForm();
    } catch (err) {
      alert('❌ Erro ao salvar: ' + err.message);
    } finally {
      setSalvando(false);
    }
  }

  // ===== CÂMERA — PONTO =====
  async function iniciarCameraPonto() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamPontoRef.current = stream;
      if (videoPontoRef.current) videoPontoRef.current.srcObject = stream;
      setCameraPontoOn(true);
      setPontoStatus('🟢 Câmera ativa');
      iniciarDetecaoPonto();
    } catch (err) {
      alert('⚠️ Não foi possível acessar a câmera: ' + err.message);
    }
  }

  function pararCameraPonto() {
    if (streamPontoRef.current) {
      streamPontoRef.current.getTracks().forEach((t) => t.stop());
      streamPontoRef.current = null;
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setCameraPontoOn(false);
    setPontoDotClass('detection-dot');
    setPontoText('Clique em "Iniciar" para começar');
    setPontoStatus('⚪ Aguardando');
    setMostrarSelecao(false);
    const canvas = overlayRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  function iniciarDetecaoPonto() {
    let reconhecendoAgora = false;

    // Sem os modelos de IA carregados, cai direto no modo de seleção manual
    if (!modelosProntos) {
      setPontoText(
        modelosErro
          ? '⚠️ Não consegui carregar o reconhecimento facial. Use a seleção manual.'
          : '⏳ Carregando modelos de reconhecimento facial...'
      );
      detectionIntervalRef.current = setInterval(() => {
        if (modelosProntos) {
          clearInterval(detectionIntervalRef.current);
          iniciarDetecaoPonto();
        }
      }, 500);
      return;
    }

    const comDescriptor = funcionarios.filter((f) => f.descriptor && f.status === 'Ativo');

    detectionIntervalRef.current = setInterval(async () => {
      const video = videoPontoRef.current;
      const canvas = overlayRef.current;
      if (!video || !video.videoWidth || !canvas || reconhecendoAgora) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const deteccao = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!deteccao) {
        setPontoDotClass('detection-dot searching');
        setPontoText('🔍 Procurando rosto...');
        return;
      }

      const box = deteccao.detection.box;
      ctx.strokeStyle = '#0a5e30';
      ctx.lineWidth = 3;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      setPontoDotClass('detection-dot active');
      setPontoText('✅ Rosto detectado! Reconhecendo...');

      if (comDescriptor.length === 0) {
        setPontoText('⚠️ Nenhum funcionário tem foto com rosto cadastrado ainda.');
        return;
      }

      reconhecendoAgora = true;
      let melhor = null;
      let menorDistancia = Infinity;
      comDescriptor.forEach((f) => {
        const distancia = faceapi.euclideanDistance(deteccao.descriptor, f.descriptor);
        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          melhor = f;
        }
      });

      if (melhor && menorDistancia < DISTANCIA_MAXIMA) {
        setPontoDotClass('detection-dot found');
        setPontoText(`✅ ${melhor.nome} reconhecido!`);
        await registrarPonto(melhor.id);
        setSelecionadoId(melhor.id);
      } else {
        setPontoDotClass('detection-dot error');
        setPontoText('❌ Rosto não reconhecido.');
        setNaoEncontrado('Rosto não reconhecido — tente novamente ou use a seleção manual');
      }

      setTimeout(() => { reconhecendoAgora = false; }, 3000);
    }, 700);
  }

  async function registrarPonto(funcionarioId) {
    const func = funcionarios.find((f) => f.id === funcionarioId);
    if (!func) {
      setNaoEncontrado('Funcionário não encontrado');
      return;
    }
    if (func.status !== 'Ativo') {
      setNaoEncontrado(`${func.nome} está inativo`);
      return;
    }

    const agora = new Date();
    const dataISO = agora.toISOString().slice(0, 10); // yyyy-mm-dd p/ coluna date
    const horaStr = agora.toTimeString().slice(0, 8); // HH:MM:SS p/ coluna time

    const registrosHoje = registros.filter(
      (r) => r.funcionario_id === funcionarioId && r.data === dataISO
    );
    const temEntrada = registrosHoje.some((r) => r.tipo === 'Entrada');
    const temSaida = registrosHoje.some((r) => r.tipo === 'Saída');

    let tipo = 'Entrada';
    let mensagem = '✅ Ponto registrado!';
    if (temEntrada && !temSaida) {
      tipo = 'Saída';
      mensagem = '🔄 Saída registrada!';
    } else if (temEntrada && temSaida) {
      tipo = 'Entrada';
      mensagem = '✅ Nova entrada registrada!';
    }

    try {
      const { data, error } = await supabase
        .from('registros')
        .insert({ funcionario_id: funcionarioId, tipo, data: dataISO, hora: horaStr })
        .select()
        .single();
      if (error) throw error;

      setRegistros((prev) => [...prev, data]);
      setRegistroOverlay({
        func, tipo, mensagem,
        hora: agora.toLocaleTimeString('pt-BR'),
      });
      setNaoEncontrado(null);
      setMostrarSelecao(false);
      setPontoText(`✅ ${mensagem} - ${func.nome}`);
      setPontoDotClass('detection-dot found');
    } catch (err) {
      alert('❌ Erro ao registrar ponto: ' + err.message);
    }
  }

  function abrirPontoManual() {
    const ativos = funcionarios.filter((f) => f.status === 'Ativo');
    if (ativos.length === 0) {
      alert('⚠️ Nenhum funcionário ativo cadastrado!');
      return;
    }
    const lista = ativos.map((f, i) => `${i + 1}. ${f.nome} - ${f.cargo}`).join('\n');
    const escolha = prompt(`Selecione um funcionário para bater ponto manualmente:\n\n${lista}\n\nDigite o número:`, '1');
    if (!escolha) return;
    const idx = parseInt(escolha, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= ativos.length) {
      alert('❌ Número inválido!');
      return;
    }
    const func = ativos[idx];
    if (confirm(`Confirma o registro de ponto para "${func.nome}"?`)) {
      registrarPonto(func.id);
      setSelecionadoId(func.id);
    }
  }

  // ===== REGISTROS PARA EXIBIÇÃO (agrupados por dia, com entrada/saída) =====
  function linhasRegistros() {
    const porDiaFunc = {};
    [...registros]
      .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
      .forEach((r) => {
        const key = r.funcionario_id + '_' + r.data;
        if (!porDiaFunc[key]) {
          porDiaFunc[key] = { funcionario_id: r.funcionario_id, data: r.data, entrada: '-', saida: '-', tipo: r.tipo };
        }
        if (r.tipo === 'Entrada') porDiaFunc[key].entrada = r.hora;
        if (r.tipo === 'Saída') porDiaFunc[key].saida = r.hora;
        porDiaFunc[key].tipo = r.tipo;
      });
    return Object.values(porDiaFunc).reverse().slice(0, 50);
  }

  const ultimosRegistros = [...registros]
    .sort((a, b) => b.id - a.id)
    .slice(0, 5);

  const totalFuncionarios = funcionarios.length;

  const tituloTab = {
    ponto: ['Bater Ponto', 'Reconhecimento facial para registro de ponto'],
    cadastrar: ['Cadastrar Funcionário', 'Adicione um novo colaborador ao sistema'],
    listar: ['Funcionários', 'Consulte, edite ou remova colaboradores'],
    registros: ['Registros de Ponto', 'Histórico de entradas e saídas'],
  }[activeTab];

  return (
    <>
      {/* ===== MOBILE HEADER ===== */}
      <div className="mobile-header">
        <button className="hamburger-btn" onClick={() => setSidebarOpen((v) => !v)} aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
        <span className="mobile-title">🏥 São Dridri</span>
      </div>

      {/* ===== SIDEBAR ===== */}
      <aside className={'sidebar' + (sidebarOpen ? ' open' : '')} id="sidebar">
        <div className="sidebar-brand">
          <h1>🏥 <span>São Dridri</span></h1>
          <p>Sistema de Ponto Facial</p>
        </div>

        <nav className="nav-items">
          <button className={'nav-item' + (activeTab === 'ponto' ? ' active' : '')} onClick={() => switchTab('ponto')}>
            <span className="icon">📷</span> Bater Ponto
          </button>
          <button className={'nav-item' + (activeTab === 'cadastrar' ? ' active' : '')} onClick={() => switchTab('cadastrar')}>
            <span className="icon">✏️</span> Cadastrar
          </button>
          <button className={'nav-item' + (activeTab === 'listar' ? ' active' : '')} onClick={() => switchTab('listar')}>
            <span className="icon">📋</span> Funcionários
          </button>
          <button className={'nav-item' + (activeTab === 'registros' ? ' active' : '')} onClick={() => switchTab('registros')}>
            <span className="icon">📊</span> Registros
          </button>
        </nav>

        <div className="nav-footer">
          <p><strong>Hospital São Dridri</strong></p>
          <p>Rua das Flores, 123 - Centro</p>
          <p>CNPJ: 00.000.000/0001-00</p>
          <p className="mt-1 text-xs text-slate-400">v2.0 · React + Supabase</p>
        </div>
      </aside>

      <div className={'sidebar-overlay' + (sidebarOpen ? ' active' : '')} onClick={() => setSidebarOpen(false)}></div>

      {/* ===== MAIN ===== */}
      <main className="main-content">
        <div className="page-header">
          <div>
            <h2>{tituloTab[0]}</h2>
            <p>{tituloTab[1]}</p>
          </div>
          <div className="header-stats">
            <div className="stat-badge">
              <span>👤</span>
              <strong>{totalFuncionarios}</strong>
              <span>funcionários</span>
            </div>
            <div className="clock-display">{horaAtual}</div>
          </div>
        </div>

        {erro && (
          <div className="card" style={{ borderColor: '#fca5a5', background: '#fef2f2', marginBottom: '1rem' }}>
            <p className="text-red-600">❌ Erro ao carregar dados do Supabase: {erro}</p>
            <button className="btn-secondary mt-2" onClick={carregarDados}>🔄 Tentar novamente</button>
          </div>
        )}
        {carregando && <p className="text-slate-500 mb-4">Carregando dados da nuvem...</p>}
        {!modelosProntos && !modelosErro && (
          <p className="text-slate-400 text-sm mb-4">⏳ Carregando modelos de reconhecimento facial (só na primeira vez, pode levar alguns segundos)...</p>
        )}
        {modelosErro && (
          <p className="text-amber-600 text-sm mb-4">⚠️ Reconhecimento facial automático indisponível ({modelosErro}). Use o botão "Manual".</p>
        )}

        {/* ===== TAB: BATER PONTO ===== */}
        {activeTab === 'ponto' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="card">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                  <h3 className="font-semibold text-slate-800">Câmera de Reconhecimento</h3>
                  <span className="text-xs bg-slate-100 px-3 py-1.5 rounded-full text-slate-500">{pontoStatus}</span>
                </div>

                <div className="camera-wrapper">
                  <video ref={videoPontoRef} autoPlay playsInline style={{ display: cameraPontoOn ? 'block' : 'none' }}></video>
                  {!cameraPontoOn && (
                    <div className="camera-placeholder">
                      <div className="icon-big">📷</div>
                      <p>Clique em "Iniciar Reconhecimento"</p>
                      <small>Posicione o rosto do funcionário na câmera</small>
                    </div>
                  )}
                  <canvas ref={overlayRef} className="face-overlay"></canvas>

                  {registroOverlay && (
                    <div className="ponto-registro-overlay" style={{ display: 'block' }}>
                      <div className="ponto-registro-card">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl">{registroOverlay.tipo === 'Entrada' ? '✅' : '🔄'}</span>
                          <span className="font-bold text-emerald-700">{registroOverlay.mensagem}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {registroOverlay.func.foto ? (
                            <img src={registroOverlay.func.foto} className="w-14 h-14 rounded-full object-cover border-2 border-slate-200" />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-2xl border-2 border-slate-200">👤</div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-800">{registroOverlay.func.nome}</div>
                            <div className="text-sm text-slate-500">{registroOverlay.func.cargo} • {registroOverlay.func.setor || 'Sem setor'}</div>
                            <div className="text-sm text-emerald-600 font-mono">{registroOverlay.hora}</div>
                          </div>
                        </div>
                        <div className="mt-3">
                          <button onClick={() => setRegistroOverlay(null)} className="text-sm text-slate-400 hover:text-slate-600">✕ Fechar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {naoEncontrado && (
                    <div className="ponto-registro-overlay" style={{ display: 'block' }}>
                      <div className="ponto-registro-card" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl">❌</span>
                          <span className="font-bold text-red-700">{naoEncontrado}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => setNaoEncontrado(null)} className="text-sm text-slate-400 hover:text-slate-600">✕ Fechar</button>
                          <button onClick={() => switchTab('cadastrar')} className="text-sm text-emerald-600 hover:text-emerald-800 font-medium">➕ Cadastrar novo funcionário</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {mostrarSelecao && !registroOverlay && (
                    <div className="ponto-registro-overlay" style={{ display: 'block' }}>
                      <div className="ponto-registro-card">
                        <p className="font-semibold text-slate-800 mb-2">👉 Quem é você?</p>
                        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                          {funcionarios.filter((f) => f.status === 'Ativo').map((f) => (
                            <button
                              key={f.id}
                              onClick={() => registrarPonto(f.id)}
                              className="text-left text-sm px-2 py-1.5 rounded hover:bg-slate-100"
                            >
                              {f.nome} — <span className="text-slate-400">{f.cargo}</span>
                            </button>
                          ))}
                        </div>
                        <button onClick={() => setMostrarSelecao(false)} className="text-sm text-slate-400 hover:text-slate-600 mt-2">✕ Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 mt-4">
                  {!cameraPontoOn ? (
                    <button className="btn-primary flex-1 min-w-[140px]" onClick={iniciarCameraPonto}>▶ Iniciar</button>
                  ) : (
                    <button className="btn-danger flex-1 min-w-[140px]" onClick={pararCameraPonto}>⏹ Parar</button>
                  )}
                  <button className="btn-secondary flex-1 min-w-[140px]" onClick={abrirPontoManual}>✋ Manual</button>
                </div>

                <div className="mt-4 p-3 bg-slate-50 rounded-xl flex items-center gap-3 border border-slate-200 flex-wrap">
                  <span className={pontoDotClass}></span>
                  <span className="text-slate-500 text-sm flex-1">{pontoText}</span>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-500 mb-2">Últimos registros</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {ultimosRegistros.length === 0 && (
                      <p className="text-slate-400 text-sm text-center">Nenhum registro ainda</p>
                    )}
                    {ultimosRegistros.map((r) => {
                      const func = funcionarios.find((f) => f.id === r.funcionario_id);
                      return (
                        <div key={r.id} className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                          <span className="text-slate-600">{r.tipo === 'Entrada' ? '🟢' : '🔴'} {func ? func.nome : 'Desconhecido'}</span>
                          <span className="text-slate-400 text-xs">{r.hora}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Detalhes */}
            <div className="lg:col-span-1">
              <div className="card">
                <h3 className="font-semibold text-slate-800 mb-4">Funcionário</h3>

                {!funcionarioSelecionado ? (
                  <div className="text-center text-slate-400 py-8">
                    <div className="text-6xl mb-4 opacity-30">👤</div>
                    <p className="text-sm">Aguardando reconhecimento</p>
                    <p className="text-xs mt-1 text-slate-300">ou clique em um funcionário</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-col items-center">
                      <div className="profile-photo">
                        {funcionarioSelecionado.foto ? (
                          <img src={funcionarioSelecionado.foto} />
                        ) : (
                          <div>👤</div>
                        )}
                      </div>

                      <div className="w-full mt-4">
                        <div className="detail-row">
                          <span className="detail-label">Nome</span>
                          <span className="detail-value">{funcionarioSelecionado.nome}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Cargo</span>
                          <span className="detail-value">{funcionarioSelecionado.cargo}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Setor</span>
                          <span className="detail-value">{funcionarioSelecionado.setor || 'Não informado'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">E-mail</span>
                          <span className="detail-value">{funcionarioSelecionado.email}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Telefone</span>
                          <span className="detail-value">{funcionarioSelecionado.telefone || 'Não informado'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Status</span>
                          <span className="detail-value">
                            <span className={'status-badge ' + (funcionarioSelecionado.status === 'Ativo' ? 'status-active' : 'status-inactive')}>
                              {funcionarioSelecionado.status}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4 w-full">
                        <button className="btn-edit flex-1 justify-center min-w-[80px]" onClick={() => editarFuncionario(funcionarioSelecionado.id)}>✏️ Editar</button>
                        <button className="btn-delete flex-1 justify-center min-w-[80px]" onClick={() => excluirFuncionario(funcionarioSelecionado.id)}>🗑️ Excluir</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB: CADASTRAR ===== */}
        {activeTab === 'cadastrar' && (
          <div className="card">
            <h3 className="font-semibold text-slate-800 mb-4">{editandoId ? 'Editar Funcionário' : 'Cadastrar Funcionário'}</h3>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <div className="camera-wrapper">
                  <video ref={videoCadastroRef} autoPlay playsInline style={{ display: cameraCadastroOn ? 'block' : 'none' }}></video>
                  {fotoData && !cameraCadastroOn && (
                    <img src={fotoData} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  {!cameraCadastroOn && !fotoData && (
                    <div className="camera-placeholder">
                      <div className="icon-big">📷</div>
                      <p>Clique em "Iniciar Câmera"</p>
                      <small>ou faça upload de uma foto</small>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button className="btn-primary flex-1 min-w-[80px]" onClick={iniciarCameraCadastro}>▶ Iniciar</button>
                  <button className="btn-primary flex-1 min-w-[80px]" disabled={!cameraCadastroOn} onClick={capturarFoto}>📸 Capturar</button>
                  <button className="btn-danger flex-1 min-w-[80px]" disabled={!cameraCadastroOn} onClick={pararCameraCadastro}>⏹ Parar</button>
                  <button className="btn-secondary w-full mt-1" onClick={() => uploadInputRef.current?.click()}>📁 Upload</button>
                  <input ref={uploadInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
                  {calculandoRosto && <p className="text-xs text-slate-400 w-full">⏳ Analisando rosto na foto...</p>}
                  {!calculandoRosto && fotoData && (
                    <p className={'text-xs w-full ' + (fotoDescriptor ? 'text-emerald-600' : 'text-amber-600')}>
                      {fotoDescriptor ? '✅ Rosto identificado, pronto para reconhecimento' : '⚠️ Nenhum rosto identificado nessa foto'}
                    </p>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2">
                <form onSubmit={handleSubmitForm}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="input-label">Nome completo *</label>
                      <input type="text" placeholder="Ex: Dr. João Silva" required className="input-field"
                        value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                    </div>
                    <div>
                      <label className="input-label">Cargo *</label>
                      <input type="text" placeholder="Ex: Médico" required className="input-field"
                        value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
                    </div>
                    <div>
                      <label className="input-label">Setor</label>
                      <input type="text" placeholder="Ex: UTI, Emergência" className="input-field"
                        value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} />
                    </div>
                    <div>
                      <label className="input-label">E-mail *</label>
                      <input type="email" placeholder="email@saodridri.com" required className="input-field"
                        value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div>
                      <label className="input-label">Telefone</label>
                      <input type="tel" placeholder="(00) 00000-0000" className="input-field"
                        value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                    </div>
                    <div>
                      <label className="input-label">Status</label>
                      <select className="input-field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        <option value="Ativo">Ativo</option>
                        <option value="Inativo">Inativo</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-4">
                    <button type="submit" className="btn-primary" disabled={salvando}>
                      {editandoId ? '✏️ Atualizar' : '➕ Cadastrar'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={resetForm}>🔄 Limpar</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB: LISTAR ===== */}
        {activeTab === 'listar' && (
          <div className="card">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
              <h3 className="font-semibold text-slate-800">Funcionários</h3>
              <input type="text" placeholder="Buscar..." className="input-field w-full sm:w-64"
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="min-w-[500px]">
                <thead>
                  <tr>
                    <th>Foto</th><th>Nome</th><th>Cargo</th><th>Setor</th><th>Status</th>
                    <th className="text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {funcionariosFiltrados.map((f) => (
                    <tr key={f.id}>
                      <td>
                        {f.foto ? (
                          <img src={f.foto} className="foto-miniatura" onClick={() => setSelecionadoId(f.id)} />
                        ) : (
                          <div className="foto-miniatura-placeholder" onClick={() => setSelecionadoId(f.id)}>👤</div>
                        )}
                      </td>
                      <td className="font-medium">{f.nome}</td>
                      <td className="text-slate-600">{f.cargo}</td>
                      <td className="text-slate-500">{f.setor || '-'}</td>
                      <td><span className={'status-badge ' + (f.status === 'Ativo' ? 'status-active' : 'status-inactive')}>{f.status}</span></td>
                      <td>
                        <div className="flex gap-1 justify-center flex-wrap">
                          <button className="btn-sm btn-edit-sm" onClick={() => { setSelecionadoId(f.id); setActiveTab('ponto'); }}>👁️</button>
                          <button className="btn-sm btn-edit-sm" onClick={() => editarFuncionario(f.id)}>✏️</button>
                          <button className="btn-sm btn-delete-sm" onClick={() => excluirFuncionario(f.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {funcionariosFiltrados.length === 0 && (
                    <tr><td colSpan="6" className="text-center py-8 text-slate-400">Nenhum funcionário encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== TAB: REGISTROS ===== */}
        {activeTab === 'registros' && (
          <div className="card">
            <h3 className="font-semibold text-slate-800 mb-4">Registros de Ponto</h3>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="min-w-[500px]">
                <thead>
                  <tr><th>Funcionário</th><th>Data</th><th>Entrada</th><th>Saída</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {linhasRegistros().length === 0 && (
                    <tr>
                      <td colSpan="5" className="text-center py-12 text-slate-400">
                        <div className="text-5xl mb-3 opacity-30">📭</div>
                        <p className="text-sm">Nenhum registro de ponto ainda</p>
                      </td>
                    </tr>
                  )}
                  {linhasRegistros().map((r, i) => {
                    const func = funcionarios.find((f) => f.id === r.funcionario_id);
                    const dataFmt = r.data ? new Date(r.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
                    return (
                      <tr key={i}>
                        <td className="font-medium">{func ? func.nome : 'Desconhecido'}</td>
                        <td className="text-slate-600">{dataFmt}</td>
                        <td className="text-emerald-600">{r.entrada}</td>
                        <td className="text-amber-600">{r.saida}</td>
                        <td><span className={'status-badge ' + (r.tipo === 'Entrada' ? 'status-active' : 'status-inactive')}>{r.tipo}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}


function AuthGate() {
  const { user, loading, signOut } = useAuth();
  if (loading) return <div className="auth-loading">Verificando sua sessão...</div>;
  if (!user) return <AuthScreen />;
  const metadata = user.user_metadata || {};
  return (
    <div className="authenticated-shell">
      <header className="auth-userbar">
        <div className="auth-user">
          {metadata.avatar_url ? <img src={metadata.avatar_url} alt="Foto do perfil" /> : <span className="auth-avatar">{(metadata.full_name || user.email || 'U').charAt(0).toUpperCase()}</span>}
          <div><strong>{metadata.full_name || metadata.name || 'Usuário conectado'}</strong><small>{user.email}</small></div>
        </div>
        <button className="btn-secondary" onClick={signOut}>Sair</button>
      </header>
      <Dashboard />
    </div>
  );
}

function AuthScreen() {
  const { signInGoogle, signInEmail, signUpEmail } = useAuth();
  const [mode, setMode] = useState('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run(action, isSignup = false) {
    setBusy(true); setMessage('');
    const result = await action();
    if (result?.error) setMessage(result.error.message || 'Não foi possível concluir. Tente novamente.');
    else if (isSignup) setMessage('Cadastro enviado! Confira seu e-mail para confirmar a conta, se a confirmação estiver ativada.');
    setBusy(false);
  }
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand-mark">D</div>
        <p className="auth-eyebrow">DRIDRI · GESTÃO</p>
        <h1>{mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}</h1>
        <p className="auth-subtitle">Entre para acessar o sistema de funcionários e registros.</p>
        <button className="google-login" disabled={busy} onClick={() => run(signInGoogle)}><span className="google-g">G</span> Continuar com Google</button>
        <div className="auth-divider"><span>ou use seu e-mail</span></div>
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); run(() => mode === 'login' ? signInEmail(email, senha) : signUpEmail(nome, email, senha), mode === 'signup'); }}>
          {mode === 'signup' && <label>Nome completo<input value={nome} onChange={e => setNome(e.target.value)} required placeholder="Seu nome" autoComplete="name" /></label>}
          <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="voce@email.com" autoComplete="email" /></label>
          <label>Senha<input type="password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={6} placeholder="Mínimo de 6 caracteres" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          <button className="auth-submit" disabled={busy}>{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <p className="auth-switch">{mode === 'login' ? 'Ainda não tem conta?' : 'Já tem uma conta?'} <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>{mode === 'login' ? 'Cadastre-se' : 'Fazer login'}</button></p>
        <small className="auth-privacy">A autenticação é gerenciada com segurança pelo Supabase.</small>
      </section>
    </main>
  );
}

export default function App() { return <AuthGate />; }
