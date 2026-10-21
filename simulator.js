//Classe Task Control Block para representar cada tarefa no sistema
class TCB {
  constructor(id, cor, ingresso, duracao, periodo, prazo, listaEventos) {
    this.id = parseInt(id); //transformar a string em inteiro
    this.cor = cor.startsWith('#') ? cor : `#${cor}`; //garantir que a cor seja um valor hexadecimal valido
    this.ingresso = parseInt(ingresso);
    this.duracao = parseInt(duracao);
    this.periodo = parseInt(periodo);
    this.prazo = parseInt(prazo);
    this.listaEventos = listaEventos || "";

    this.estado = (this.ingresso === 0) ? "PRONTA" : "AGUARDANDO_INGRESSO";
    this.tempoRestanteCPU = parseInt(duracao); 
    this.proximoIngresso = parseInt(ingresso);
    this.deadlineAtual = parseInt(ingresso) + parseInt(prazo);
    this.execucoesConcluidas = 0; 
    this.cpuAtual = -1;
    this.ticksExecutadosContinuos = 0; 
  }
}

//Definição dos algoritmos de escalonamento disponíveis no sistema
const Escalonadores = {
  RM: { //tarefa com o menor período tem maior prioridade
    nome: "Rate Monotonic",
    comparar: (a, b) => a.periodo - b.periodo 
  },
  EDF: { //tarefa que tiver o prazo (deadline) mais próximo recebe a maior prioridade
    nome: "Earliest Deadline First",
    comparar: (a, b) => a.deadlineAtual - b.deadlineAtual 
  }
};

//Configuração inicial do sistema
let configSistema = {
  algoritmo: "RM",
  quantum: 2,
  qtdCpus: 2,
  tarefas: [],
  tickAtual: 0
};

let ultimoConteudoTexto = null; //Guarda o conteúdo original do arquivo carregado
let historicoEstados = []; //Guarda snapshots do estado do sistema para permitir retroceder ticks
let historicoExecucaoGantt = []; //Guarda o histórico de execução das tarefas para desenhar o gráfico de Gantt
let eventosGantt = []; //Guarda eventos de ingresso, conclusão, deadline miss e sorteio para desenhar no gráfico de Gantt

//Inicializacao com valores padrao
window.addEventListener('DOMContentLoaded', () => {
  carregarCenarioPadrao();
  conectarEventos();
});

//Carrega o cenário padrão do sistema
function carregarCenarioPadrao() {
  ultimoConteudoTexto = null; //Limpa o arquivo armazenado se voltar ao padrão do sistema
  configSistema.algoritmo = "RM";
  configSistema.quantum = 2;
  configSistema.qtdCpus = 2;
  configSistema.tickAtual = 0;
  historicoEstados = [];
  historicoExecucaoGantt = [];
  eventosGantt = [];

  configSistema.tarefas = [
    new TCB("2", "00FF00", "2", "2", "6", "6", ""),
    new TCB("1", "FF0000", "0", "3", "10", "10", "")
  ];

  configSistema.tarefas.sort((a, b) => b.id - a.id); //ordena as tarfeas para que a tarefa com maior ID fique no topo da lista
  
  eventosGantt.push({ tick: 0, taskId: 1, tipo: "INGRESSO" });

  document.getElementById('logOutput').innerHTML = ""; //limpa o log de eventos
  log(`Sistema inicializado com Parâmetros Padrão: Algoritmo=${configSistema.algoritmo}, Quantum=${configSistema.quantum}, CPUs=${configSistema.qtdCpus}`); 
  atualizarDropdownTarefas(); //atualiza o dropdown de seleção de tarefas
  desenharGantt(); //desenha o gráfico de Gantt inicial
}

//Função de reinicio para o cenário inicial do sistema ou do arquivo carregado
function reiniciarSimulacao() {
  if (ultimoConteudoTexto) {
    //Se há um arquivo carregado, repassa o texto original pelo parser
    parseConfigFile(ultimoConteudoTexto);
    log(`Simulação reiniciada para as configurações iniciais do arquivo!`);
  } else {
    //Se não há arquivo, restaura o cenário padrão
    carregarCenarioPadrao();
  }
  
  //Reabilita os botões de simulação
  document.getElementById('btnStep').disabled = false;
  document.getElementById('btnRunAll').disabled = false;
  document.getElementById('btnBack').disabled = true;

  atualizarDropdownTarefas();
  desenharGantt();
}

//Conecta os eventos dos botões e inputs do HTML
function conectarEventos() {
  document.getElementById('fileInput').addEventListener('change', carregarArquivoConfig);
  document.getElementById('btnStep').addEventListener('click', avancarTick);
  document.getElementById('btnBack').addEventListener('click', retrocederTick);
  document.getElementById('btnRunAll').addEventListener('click', executarTudo);
  document.getElementById('btnReset').addEventListener('click', reiniciarSimulacao);
  document.getElementById('btnExport').addEventListener('click', exportarGanttParaPNG);
  document.getElementById('btnApplyEdit').addEventListener('click', aplicarModificacaoTarefa);
  document.getElementById('selectTaskEdit').addEventListener('change', carregarCamposEdicao);
}

//Carrega o arquivo de configuração selecionado pelo usuário e atualiza a configuração do sistema
function carregarArquivoConfig(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      ultimoConteudoTexto = evt.target.result; //Guarda o texto original na variável
      parseConfigFile(evt.target.result);
      log(`Arquivo descarregado com sucesso! Algoritmo: ${configSistema.algoritmo}, Quantum: ${configSistema.quantum}, CPUs: ${configSistema.qtdCpus}`);
      atualizarDropdownTarefas();
      desenharGantt();
    } catch (err) {
      alert(`Erro no Arquivo de Configuração: ${err.message}`);
      log(`ERRO: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

//ler o conteúdo do arquivo de configuração e atualizar a configuração do sistema
function parseConfigFile(conteudoTexto) {
  const linhas = conteudoTexto.split('\n');
  const linhasValidas = [];

  for (let linha of linhas) {
    linha = linha.trim();
    if (linha.endsWith(';')) linha = linha.slice(0, -1).trim(); 
    if (linha.length > 0) linhasValidas.push(linha);            
  }

  if (linhasValidas.length < 2) {
    throw new Error("O arquivo deve conter a linha do sistema e pelo menos uma tarefa.");
  }

  const pGlobal = linhasValidas[0].split(';');
  configSistema.algoritmo = pGlobal[0].trim().toUpperCase(); 
  configSistema.quantum = parseInt(pGlobal[1].trim());
  configSistema.qtdCpus = parseInt(pGlobal[2].trim());

  if (!Escalonadores[configSistema.algoritmo]) {
    throw new Error(`Algoritmo '${configSistema.algoritmo}' não suportado. Use RM ou EDF.`);
  }

  configSistema.tarefas = [];
  configSistema.tickAtual = 0;
  historicoEstados = [];
  historicoExecucaoGantt = [];
  eventosGantt = [];

  for (let i = 1; i < linhasValidas.length; i++) {
    const pTask = linhasValidas[i].split(';');
    const id = pTask[0].trim();
    const cor = pTask[1].trim();
    const ingresso = pTask[2].trim();
    const duracao = pTask[3].trim();
    const periodo = parseInt(pTask[4].trim());
    const prazo = pTask[5].trim();
    const eventos = pTask[6] ? pTask[6].trim() : "";

    if (periodo <= 0) { 
      log(`Aviso: Tarefa ID ${id} é aperiódica (período <= 0). Ignorada no Projeto A.`);
      continue;
    }

    const task = new TCB(id, cor, ingresso, duracao, periodo, prazo, eventos);
    configSistema.tarefas.push(task);

    if (task.ingresso === 0) {
      eventosGantt.push({ tick: 0, taskId: task.id, tipo: "INGRESSO" });
    }
  }

  configSistema.tarefas.sort((a, b) => b.id - a.id); 
  document.getElementById('logOutput').innerHTML = "";
}

//Função de comparação de prioridade com desempate, usada para ordenar tarefas prontas para execução
function compararPrioridadeComDesempate(a, b, tarefaExecutandoAtualmente, tickAtual) {

  const compBase = Escalonadores[configSistema.algoritmo].comparar(a, b);
  if (compBase !== 0) return compBase; //retorna a comparação normal se houver diferença de prioridade

  //se houver empate, desempata com base na tarefa que estava executando anteriormente na CPU para evitar troca de contexto desnecessária
  if (tarefaExecutandoAtualmente) {
    if (a.id === tarefaExecutandoAtualmente.id) return -1;
    if (b.id === tarefaExecutandoAtualmente.id) return 1;
  }

  //Se ainda houver empate, desempata com base no prazo (deadline) mais próximo
  if (a.prazo !== b.prazo) return a.prazo - b.prazo;

  //Se ainda houver empate, desempata com base no ingresso mais próximo
  if (a.ingresso !== b.ingresso) return a.ingresso - b.ingresso;

  //Se ainda houver empate, desempata com base na duração menor
  if (a.duracao !== b.duracao) return a.duracao - b.duracao;

  //se ainda houver empate, desempata com um sorteio aleatorio
  const escolhida = Math.random() < 0.5 ? a : b;
  eventosGantt.push({ tick: tickAtual, taskId: escolhida.id, tipo: "SORTEIO" });
  return escolhida === a ? -1 : 1;
}

//salva o estado atual do sistema para voltar ticks
function salvarSnapshot() {
  const snapshot = {
    tickAtual: configSistema.tickAtual, 
    tarefas: configSistema.tarefas.map(t => ({
      id: t.id,
      estado: t.estado,
      tempoRestanteCPU: t.tempoRestanteCPU,
      proximoIngresso: t.proximoIngresso,
      deadlineAtual: t.deadlineAtual,
      execucoesConcluidas: t.execucoesConcluidas,
      cpuAtual: t.cpuAtual,
      ticksExecutadosContinuos: t.ticksExecutadosContinuos
    })),
    gantt: JSON.parse(JSON.stringify(historicoExecucaoGantt)),
    eventos: JSON.parse(JSON.stringify(eventosGantt))
  };
  historicoEstados.push(snapshot);
  document.getElementById('btnBack').disabled = false;
}

//Avança o sistema em um tick, atualizando estados das tarefas, executando-as nas CPUs e registrando eventos
function avancarTick() {
  if (todasTarefasConcluidas()) {
    log(`Simulação Concluída! Todas as tarefas completaram 10 execuções.`);
    desenharGantt();
    return;
  }

  salvarSnapshot();
  const tick = configSistema.tickAtual;
  log(`--- TICK ${tick} ---`);

  //Identifica quais tarefas estavam executando no tick anterior para cada CPU
  const tarefasExecutandoAnterior = [];
  for (let c = 0; c < configSistema.qtdCpus; c++) { 
    const ultimoRegistro = historicoExecucaoGantt.filter(h => h.tick === tick - 1 && h.cpu === c && h.taskId !== null);
    if (ultimoRegistro.length > 0) { 
      //Se havia uma tarefa executando na CPU c no tick anterior, encontra a tarefa correspondente
      const taskAnterior = configSistema.tarefas.find(t => t.id === ultimoRegistro[0].taskId);
      //Se a tarefa anterior ainda está pronta ou executando, mantém a referência; caso contrário, define como null
      tarefasExecutandoAnterior[c] = taskAnterior || null; 
    } else {
      tarefasExecutandoAnterior[c] = null;
    }
  }

  //Atualiza o estado das tarefas com base no tick atual, ingresso, período e deadlines
  configSistema.tarefas.forEach(t => {
    if (t.execucoesConcluidas >= 10) {
      t.estado = "CONCLUIDA";
      return;
    }

    if (t.estado === "AGUARDANDO_INGRESSO" && tick >= t.ingresso) {
      t.estado = "PRONTA";
      t.tempoRestanteCPU = t.duracao;
      t.deadlineAtual = tick + t.prazo;
      eventosGantt.push({ tick: tick, taskId: t.id, tipo: "INGRESSO" });
      log(`Tarefa ID ${t.id} INGRESSOU no sistema (Deadline: ${t.deadlineAtual}).`);
    }

    if (t.estado === "ESPERANDO_PERIODO" && tick >= t.proximoIngresso) {
      t.estado = "PRONTA";
      t.tempoRestanteCPU = t.duracao;
      t.deadlineAtual = tick + t.prazo;
      t.ticksExecutadosContinuos = 0;
      eventosGantt.push({ tick: tick, taskId: t.id, tipo: "INGRESSO" });
      log(`Tarefa ID ${t.id} REATIVADA para novo período (Deadline: ${t.deadlineAtual}).`);
    }

    if ((t.estado === "PRONTA" || t.estado === "EXECUTANDO") && tick > t.deadlineAtual) {
      log(`ALERTA: Tarefa ID ${t.id} ultrapassou o prazo (Deadline Missed no tick ${tick})!`);
      eventosGantt.push({ tick: tick, taskId: t.id, tipo: "DEADLINE_MISS" });
    }

    if (t.estado === "SUSPENSA") {
      historicoExecucaoGantt.push({ tick: tick, cpu: null, taskId: t.id, estado: "SUSPENSA" });
    }
  });

  //Verifica se alguma tarefa excedeu o quantum e precisa ser preemptada
  if (configSistema.quantum > 0) {
    configSistema.tarefas.forEach(t => {
      if (t.estado === "EXECUTANDO" && t.ticksExecutadosContinuos >= configSistema.quantum && t.tempoRestanteCPU > 0) {
        log(`QUANTUM EXPIRADO: Tarefa ID ${t.id} sofreu preempção por estourar quantum de ${configSistema.quantum} ticks.`);
        t.estado = "PRONTA";
        t.ticksExecutadosContinuos = 0;
      }
    });
  }

  //Seleciona as tarefas prontas para execução e reseta o CPUAtual de todas as tarefas
  let tarefasProntas = configSistema.tarefas.filter(t => t.estado === "PRONTA" || t.estado === "EXECUTANDO");
  configSistema.tarefas.forEach(t => { t.cpuAtual = -1; });

  //Executa as tarefas nas CPUs disponíveis, aplicando o algoritmo de escalonamento e registrando eventos no Gantt
  for (let cpu = 0; cpu < configSistema.qtdCpus; cpu++) {
    if (tarefasProntas.length === 0) {
      log(`CPU ${cpu + 1}: Desligada / Ociosa no tick ${tick}.`);
      historicoExecucaoGantt.push({ tick: tick, cpu: cpu, taskId: null, estado: "OCIOSA" });
      continue;
    }

    const taskAnteriorCPU = tarefasExecutandoAnterior[cpu];
    tarefasProntas.sort((a, b) => compararPrioridadeComDesempate(a, b, taskAnteriorCPU, tick));

    let tarefaEscolhida = tarefasProntas.shift();
    tarefaEscolhida.estado = "EXECUTANDO";
    tarefaEscolhida.cpuAtual = cpu;
    tarefaEscolhida.ticksExecutadosContinuos++;

    log(`CPU ${cpu + 1}: Executando Tarefa ID ${tarefaEscolhida.id} (Restante: ${tarefaEscolhida.tempoRestanteCPU} ticks).`);

    historicoExecucaoGantt.push({
      tick: tick,
      cpu: cpu,
      taskId: tarefaEscolhida.id,
      cor: tarefaEscolhida.cor,
      estado: "EXECUTANDO"
    });

    tarefaEscolhida.tempoRestanteCPU--;

    //Se a tarefa concluiu sua execução, atualiza o estado e registra o evento de conclusão
    if (tarefaEscolhida.tempoRestanteCPU <= 0) {
      tarefaEscolhida.execucoesConcluidas++;
      tarefaEscolhida.ticksExecutadosContinuos = 0;
      eventosGantt.push({ tick: tick + 1, taskId: tarefaEscolhida.id, tipo: "CONCLUSAO" }); // Correção 5
      log(`Tarefa ID ${tarefaEscolhida.id} CONCLUIU a execução ${tarefaEscolhida.execucoesConcluidas}/10.`);

      if (tarefaEscolhida.execucoesConcluidas >= 10) {
        tarefaEscolhida.estado = "CONCLUIDA";
      } else {
        tarefaEscolhida.estado = "ESPERANDO_PERIODO";
        tarefaEscolhida.proximoIngresso += tarefaEscolhida.periodo;
      }
    }
  }

  configSistema.tickAtual++;
  atualizarDropdownTarefas();
  desenharGantt();
}

//Permite retroceder o sistema em um tick, restaurando o estado anterior das tarefas e do Gantt
function retrocederTick() {
  if (historicoEstados.length === 0) return; //Se está no início, não tem como retroceder

  const ultimoEstado = historicoEstados.pop();
  configSistema.tickAtual = ultimoEstado.tickAtual;
  historicoExecucaoGantt = ultimoEstado.gantt;
  eventosGantt = ultimoEstado.eventos;

  //Restaura o estado das tarefas com base no snapshot salvo
  ultimoEstado.tarefas.forEach(tSalva => {
    let tAtual = configSistema.tarefas.find(t => t.id === tSalva.id);
    if (tAtual) {
      tAtual.estado = tSalva.estado;
      tAtual.tempoRestanteCPU = tSalva.tempoRestanteCPU;
      tAtual.proximoIngresso = tSalva.proximoIngresso;
      tAtual.deadlineAtual = tSalva.deadlineAtual;
      tAtual.execucoesConcluidas = tSalva.execucoesConcluidas;
      tAtual.cpuAtual = tSalva.cpuAtual;
      tAtual.ticksExecutadosContinuos = tSalva.ticksExecutadosContinuos;
    }
  });

  log(`<<< Retrocedido para o TICK ${configSistema.tickAtual}`);
  if (historicoEstados.length === 0) document.getElementById('btnBack').disabled = true;

  atualizarDropdownTarefas();
  desenharGantt();
}

//Executa ticks automaticamente até que todas as tarefas sejam concluídas ou atinja um limite de segurança para evitar loops infinitos
function executarTudo() {
  let segurancaLoop = 0;
  while (!todasTarefasConcluidas() && segurancaLoop < 2000) {
    avancarTick();
    segurancaLoop++;
  }
}

//Verifica se todas as tarefas concluíram 10 execuções, indicando que a simulação pode ser finalizada
function todasTarefasConcluidas() {
  return configSistema.tarefas.length > 0 && 
         configSistema.tarefas.every(t => t.execucoesConcluidas >= 10);
}

//Desenha o gráfico de Gantt no canvas, representando a execução das tarefas ao longo do tempo
function desenharGantt() {
  const canvas = document.getElementById('ganttCanvas');
  const ctx = canvas.getContext('2d');
  const tarefas = configSistema.tarefas;

  if (tarefas.length === 0) return;

  const totalTicks = Math.max(configSistema.tickAtual + 2, 20);
  const cellWidth = 35;
  const cellHeight = 35;
  const marginLeft = 80;
  const marginTop = 40;
  const marginBottom = 80;

  canvas.width = marginLeft + totalTicks * cellWidth + 20;
  canvas.height = marginTop + tarefas.length * cellHeight + marginBottom;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  //Eixo X - Ticks
  ctx.fillStyle = "#333333";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  for (let t = 0; t <= totalTicks; t++) {
    const x = marginLeft + t * cellWidth;
    ctx.fillText(t.toString(), x, marginTop - 10);

    ctx.strokeStyle = "#e0e0e0";
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, marginTop + tarefas.length * cellHeight);
    ctx.stroke();
  }

  
  const tarefasOrdenadasGantt = [...tarefas].sort((a, b) => a.id - b.id);

  //Eixo Y - Tarefas
  tarefasOrdenadasGantt.forEach((task, index) => {
    const linhaVisual = (tarefasOrdenadasGantt.length - 1) - index;
    const y = marginTop + linhaVisual * cellHeight;

    ctx.fillStyle = "#000000";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`T${task.id}`, marginLeft - 10, y + cellHeight / 2 + 4);

    ctx.strokeStyle = "#cccccc";
    ctx.strokeRect(marginLeft, y, totalTicks * cellWidth, cellHeight);
  });

  //Desenha os blocos de execução das tarefas no gráfico de Gantt com base no histórico de execução
  historicoExecucaoGantt.forEach(item => {
    if (item.taskId === null || item.taskId === undefined) return;

    const taskIndex = tarefasOrdenadasGantt.findIndex(t => t.id === item.taskId);
    if (taskIndex === -1) return;

    const linhaVisual = (tarefasOrdenadasGantt.length - 1) - taskIndex;
    const x = marginLeft + item.tick * cellWidth;
    const y = marginTop + linhaVisual * cellHeight;

    if (item.estado === "EXECUTANDO") {
      ctx.fillStyle = item.cor || "#333333";
      ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`C${item.cpu + 1}`, x + cellWidth / 2, y + cellHeight / 2 + 4);
    } else if (item.estado === "SUSPENSA") {
      
      ctx.fillStyle = "#000000";
      for (let px = x + 4; px < x + cellWidth - 3; px += 5) {
        for (let py = y + 4; py < y + cellHeight - 3; py += 5) {
          ctx.fillRect(px, py, 2, 2);
        }
      }
    }
  });

  //Desenha os eventos de ingresso, conclusão, deadline miss e sorteio no gráfico de Gantt
  eventosGantt.forEach(ev => {
    if (ev.tick > configSistema.tickAtual + 1) return;

    const taskIndex = tarefasOrdenadasGantt.findIndex(t => t.id === ev.taskId);
    if (taskIndex === -1) return;

    const linhaVisual = (tarefasOrdenadasGantt.length - 1) - taskIndex;
    const x = marginLeft + ev.tick * cellWidth;
    const y = marginTop + linhaVisual * cellHeight;

    if (ev.tipo === "INGRESSO") {
      ctx.fillStyle = "#00aa00";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.fillText("↓", x + 6, y + 14); 
    } else if (ev.tipo === "CONCLUSAO") {
      ctx.fillStyle = "#0056b3";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.fillText("★", x, y + cellHeight - 5); 
    } else if (ev.tipo === "DEADLINE_MISS") {
      ctx.fillStyle = "#ff0000";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.fillText("✕", x + cellWidth - 8, y + 14); 
    } else if (ev.tipo === "SORTEIO") {
      ctx.fillStyle = "#e67e22";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.fillText("🎲", x + cellWidth / 2, y + 12); 
    }
  });

  desenharLegendaGantt(ctx, marginTop + tarefas.length * cellHeight + 25);
}

//Desenha a legenda do gráfico de Gantt, explicando os símbolos e cores utilizados
function desenharLegendaGantt(ctx, yInicio) {
  ctx.fillStyle = "#222222";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Legenda:", 20, yInicio);

  let xCoord = 80;
  ctx.fillStyle = "#007bff";
  ctx.fillRect(xCoord, yInicio - 10, 15, 12);
  ctx.fillStyle = "#000000";
  ctx.font = "11px Arial";
  ctx.fillText("Executando (Cor + CPU)", xCoord + 22, yInicio);

  xCoord += 180;
  ctx.fillStyle = "#00aa00";
  ctx.font = "bold 14px Arial";
  ctx.fillText("↓", xCoord, yInicio);
  ctx.fillStyle = "#000000";
  ctx.font = "11px Arial";
  ctx.fillText("Ingresso", xCoord + 15, yInicio);

  xCoord += 110;
  ctx.fillStyle = "#0056b3";
  ctx.font = "bold 12px Arial";
  ctx.fillText("★", xCoord, yInicio);
  ctx.fillStyle = "#000000";
  ctx.font = "11px Arial";
  ctx.fillText("Término Ciclo", xCoord + 15, yInicio);

  xCoord += 130;
  ctx.fillStyle = "#ff0000";
  ctx.font = "bold 12px Arial";
  ctx.fillText("✕", xCoord, yInicio);
  ctx.fillStyle = "#000000";
  ctx.font = "11px Arial";
  ctx.fillText("Deadline Missed", xCoord + 15, yInicio);

  xCoord += 140;
  ctx.fillStyle = "#e67e22";
  ctx.font = "12px Arial";
  ctx.fillText("🎲", xCoord, yInicio);
  ctx.fillStyle = "#000000";
  ctx.font = "11px Arial";
  ctx.fillText("Desempate Sorteio", xCoord + 18, yInicio);
}

//Exporta o gráfico de Gantt atual como uma imagem PNG para download
function exportarGanttParaPNG() {
  const canvas = document.getElementById('ganttCanvas');
  const imageURI = canvas.toDataURL("image/png");

  const link = document.createElement('a');
  link.download = `gantt_escalonamento_tick_${configSistema.tickAtual}.png`;
  link.href = imageURI;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  log("Gráfico de Gantt exportado em imagem PNG com sucesso!");
}

//Atualiza o dropdown de seleção de tarefas para edição, refletindo as tarefas atuais do sistema
function atualizarDropdownTarefas() {
  const select = document.getElementById('selectTaskEdit');
  select.innerHTML = "";

  configSistema.tarefas.forEach(task => {
    const option = document.createElement('option');
    option.value = task.id;
    option.textContent = `Tarefa ID ${task.id} (${task.estado})`;
    select.appendChild(option);
  });

  if (configSistema.tarefas.length > 0) {
    carregarCamposEdicao();
  }
}

//Carrega os campos de edição com os valores da tarefa selecionada no dropdown, permitindo ao usuário modificar estado, duração e prazo
function carregarCamposEdicao() {
  const taskId = parseInt(document.getElementById('selectTaskEdit').value);
  const task = configSistema.tarefas.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('selectStateEdit').value = task.estado === "EXECUTANDO" ? "PRONTA" : task.estado;
  document.getElementById('inputDurationEdit').value = task.tempoRestanteCPU;
  document.getElementById('inputDeadlineEdit').value = task.prazo;
}

//Aplica as modificações feitas pelo usuário na tarefa selecionada, atualizando seu estado, duração e prazo, e registrando o evento no log
function aplicarModificacaoTarefa() {
  const taskId = parseInt(document.getElementById('selectTaskEdit').value);
  const task = configSistema.tarefas.find(t => t.id === taskId);
  if (!task) return;

  const novoEstado = document.getElementById('selectStateEdit').value;
  const novaDuracao = parseInt(document.getElementById('inputDurationEdit').value);
  const novoPrazo = parseInt(document.getElementById('inputDeadlineEdit').value);

  if (isNaN(novaDuracao) || novaDuracao <= 0 || isNaN(novoPrazo) || novoPrazo <= 0) {
    alert("Erro de Validação: Duração e Prazo devem ser maiores que zero.");
    return;
  }

  salvarSnapshot();
  const estadoAntigo = task.estado;
  task.estado = novoEstado;
  task.tempoRestanteCPU = novaDuracao;
  task.prazo = novoPrazo;

  log(`MODIFICAÇÃO MANUAL: Tarefa ID ${task.id} alterada de ${estadoAntigo} para ${task.estado}.`);
  atualizarDropdownTarefas();
  desenharGantt();
}

//Função de log para exibir mensagens no console do sistema
function log(mensagem) {
  const logBox = document.getElementById('logOutput');
  logBox.innerHTML += `<div>> ${mensagem}</div>`;
  logBox.scrollTop = logBox.scrollHeight;
}
