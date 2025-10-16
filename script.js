document.addEventListener('DOMContentLoaded', function() {
    // --- ESTADO DA APLICAÇÃO ---
    let clients = [];
    let currentClientId = null;
    let planilhas = [];
    let verificacoesConcluidas = [];
    let lembretes = [];

    const APP_PREFIX = 'sca_v9';

    const icons = {
        verify: `&#10003;`, 
        addPendency: `&#9888;`,
        addReminder: `&#128197;`,
        edit: `&#9998;`,
        delete: `&#128465;`,
        revert: `&#8634;`
    };
    
    const seedData = [
        { codigo: 'PPHO 5.01', descricao: 'PPHO pré OPERACIONAL ABATE', frequencia: 'Diária', arquivamento: 'Qualysys', monitor: 'Ana' },
        { codigo: 'HIG 6.01', descricao: 'CHECK LIST HIGIENE PESSOAL', frequencia: 'Diária', arquivamento: 'Qualysys', monitor: 'Carlos' },
        { codigo: '1.03 MAN', descricao: 'MANUTENÇÃO PREV DOS EQ. SEMANAL', frequencia: 'Semanal', arquivamento: 'Qualysys', monitor: 'Ana' },
        { codigo: '1.01 MAN', descricao: 'Check list de manutenção das instalações', frequencia: 'Mensal', arquivamento: 'Qualysys', monitor: 'Mariana' },
        { codigo: 'TEMP 9.02', descricao: 'CONTROLE DE EXPEDIÇÃO', frequencia: 'Outra', arquivamento: 'Físico', monitor: 'João' }
    ];

    function initializeData() {
        clients = JSON.parse(localStorage.getItem(`${APP_PREFIX}_clients`)) || [];
        currentClientId = localStorage.getItem(`${APP_PREFIX}_currentClientId`);

        populateClientSelector();

        if (currentClientId && clients.some(c => c.id == currentClientId)) {
            loadClientData(currentClientId);
            document.getElementById('app-content').style.display = 'block';
            document.getElementById('no-client-overlay').style.display = 'none';
        } else {
            document.getElementById('app-content').style.display = 'none';
            document.getElementById('no-client-overlay').style.display = 'block';
        }
        renderAll();
    }
    
    function loadClientData(clientId) {
        const storedPlanilhas = localStorage.getItem(`${APP_PREFIX}_planilhas_${clientId}`);
        verificacoesConcluidas = JSON.parse(localStorage.getItem(`${APP_PREFIX}_concluidas_${clientId}`)) || [];
        lembretes = JSON.parse(localStorage.getItem(`${APP_PREFIX}_lembretes_${clientId}`)) || [];
        
        if (storedPlanilhas) {
            planilhas = JSON.parse(storedPlanilhas);
        } else {
            // Se é a primeira vez que carrega dados para este cliente, usa o seed.
            planilhas = seedData.map((p, index) => ({
                ...p, id: Date.now() + index,
                ultimaVerificacao: null, pendencia: null
            }));
            savePlanilhas();
        }
    }

    // --- LÓGICA DE CLIENTES ---
    const clientSelector = document.getElementById('clientSelector');
    function populateClientSelector() {
        clientSelector.innerHTML = '<option value="">Selecione um cliente...</option>';
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            if (client.id == currentClientId) {
                option.selected = true;
            }
            clientSelector.appendChild(option);
        });
    }

    clientSelector.addEventListener('change', () => {
        const newClientId = clientSelector.value;
        if (newClientId) {
            localStorage.setItem(`${APP_PREFIX}_currentClientId`, newClientId);
            location.reload();
        }
    });

    // --- LÓGICA DE DATA E STATUS (ATUALIZADA) ---
    const getStatus = (p) => {
        if (p.arquivamento === 'Físico') return { text: 'Físico', class: 'status-anotacao' };

        if (p.pendencia) {
            if (p.pendencia.tipo === 'anotacao') return { text: 'Com Anotação', class: 'status-anotacao' };
            if (p.pendencia.tipo === 'nao_houve') return { text: 'Não Realizada', class: 'status-overdue' };
        }

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const ultima = p.ultimaVerificacao ? new Date(p.ultimaVerificacao + 'T00:00:00') : null;

        let isPending = false;

        switch (p.frequencia) {
            case 'Diária':
                if (!ultima || ultima.getTime() < hoje.getTime()) {
                    isPending = true;
                }
                break;
            case 'Semanal':
                const inicioDaSemana = new Date(hoje);
                inicioDaSemana.setDate(hoje.getDate() - hoje.getDay());
                inicioDaSemana.setHours(0, 0, 0, 0);
                if (!ultima || ultima.getTime() < inicioDaSemana.getTime()) {
                    isPending = true;
                }
                break;
            case 'Mensal':
                const inicioDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                if (!ultima || ultima.getTime() < inicioDoMes.getTime()) {
                    isPending = true;
                }
                break;
            default:
                if (!ultima) {
                    isPending = true;
                }
                break;
        }

        if (isPending) {
            let cicloAnteriorInicio = new Date(hoje);
            if (p.frequencia === 'Diária') cicloAnteriorInicio.setDate(hoje.getDate() - 1);
            else if (p.frequencia === 'Semanal') cicloAnteriorInicio.setDate(hoje.getDate() - 7);
            else if (p.frequencia === 'Mensal') cicloAnteriorInicio.setMonth(hoje.getMonth() - 1);
            
            if (p.frequencia !== 'Outra' && ultima && ultima < cicloAnteriorInicio) {
                 return { text: 'Atrasada', class: 'status-overdue' };
            }
            return { text: 'Pendente', class: 'status-pending' };
        }

        return { text: 'Em Dia', class: 'status-ok' };
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('pt-BR');
    };
    
    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    const renderAll = () => {
        if (!currentClientId && window.location.hash !== '#clientes') {
            document.getElementById('app-content').style.display = 'none';
            document.getElementById('no-client-overlay').style.display = 'block';
            return;
        }
        document.getElementById('app-content').style.display = 'block';
        document.getElementById('no-client-overlay').style.display = 'none';

        renderCadastroGeral();
        renderAuditoriaTabs();
        updateDashboard();
        renderVerificadas();
        renderClients();
    };

    const renderCadastroGeral = () => {
        const container = document.getElementById('cadastro-geral-container');
        const tableHTML = `
            <table>
                <thead><tr><th>Código</th><th>Descrição</th><th>Frequência</th><th>Monitor(a)</th><th>Arquivamento</th><th>Ações</th></tr></thead>
                <tbody>
                    ${planilhas.map(p => `
                        <tr>
                            <td>${p.codigo}</td><td>${p.descricao}</td><td>${p.frequencia}</td>
                            <td>${p.monitor || 'N/D'}</td><td>${p.arquivamento}</td>
                            <td class="actions">
                                <button class="btn-edit" title="Editar" onclick="abrirPlanilhaModal(${p.id})">${icons.edit}</button>
                                <button class="btn-delete" title="Excluir" onclick="deletarPlanilha(${p.id})">${icons.delete}</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        container.innerHTML = tableHTML;
    };

    const renderAuditoriaTabs = () => {
        const containers = { 'Diária': [], 'Semanal': [], 'Mensal': [], 'Outra': [], 'Físico': [] };
        planilhas.forEach(p => {
            if (p.arquivamento === 'Físico') {
                containers.Físico.push(p);
            } else {
                containers[p.frequencia]?.push(p);
            }
        });
        
        const freqToTabId = {
            'Diária': 'tab-diarias',
            'Semanal': 'tab-semanais',
            'Mensal': 'tab-mensais',
            'Outra': 'tab-outras'
        };

        for (const frequencia in freqToTabId) {
            const containerId = freqToTabId[frequencia];
            const container = document.getElementById(containerId);
            if (!container) continue;
            
            const planilhasParaMostrar = containers[frequencia].filter(p => getStatus(p).class !== 'status-ok');
            
            if (planilhasParaMostrar.length === 0) {
                container.innerHTML = '<p>Nenhuma pendência para esta frequência no momento.</p>';
                continue;
            }
            
            const tableHTML = `
                <table>
                    <thead><tr><th>Status</th><th>Código</th><th>Descrição</th><th>Monitor(a)</th><th>Última Verificação</th><th>Ações</th></tr></thead>
                    <tbody>
                    ${planilhasParaMostrar.map(p => {
                        const status = getStatus(p);
                        return `<tr>
                            <td><span class="status-badge ${status.class}">${status.text}</span></td>
                            <td>${p.codigo}</td><td>${p.descricao}</td><td>${p.monitor || 'N/D'}</td><td>${formatDate(p.ultimaVerificacao)}</td>
                            <td class="actions">
                                <button class="btn-verify" title="Marcar como Verificada" onclick="marcarVerificada(${p.id})">${icons.verify}</button>
                                <button class="btn-add-pendency" title="Registrar Pendência" onclick="abrirPendencyModal(${p.id})">${icons.addPendency}</button>
                                <button class="btn-add-reminder" title="Adicionar Lembrete" onclick="abrirReminderModal(${p.id})">${icons.addReminder}</button>
                            </td>
                        </tr>`
                    }).join('')}
                    </tbody></table>`;
            container.innerHTML = tableHTML;
        }

        const fisicoContainer = document.getElementById('tab-fisico');
        if (containers.Físico.length === 0) {
            fisicoContainer.innerHTML = '<p>Nenhuma planilha de arquivamento físico.</p>';
            return;
        }
        fisicoContainer.innerHTML = `
            <table>
                <thead><tr><th>Código</th><th>Descrição</th><th>Monitor(a)</th><th>Frequência</th></tr></thead>
                <tbody>
                    ${containers.Físico.map(p => `
                        <tr><td>${p.codigo}</td><td>${p.descricao}</td><td>${p.monitor || 'N/D'}</td><td>${p.frequencia}</td></tr>
                    `).join('')}
                </tbody>
            </table>`;
    };

    const renderVerificadas = () => {
         const container = document.getElementById('verified-list-container');
        const filterDate = document.getElementById('filterVerifiedDate').value;
        const filterFreq = document.getElementById('filterVerifiedFreq').value;
        let filtered = verificacoesConcluidas;
        if (filterDate) filtered = filtered.filter(v => v.dataVerificacao === filterDate);
        if (filterFreq !== 'todas') {
            filtered = filtered.filter(v => {
                const p = planilhas.find(pl => pl.id === v.planilhaId);
                return p && p.frequencia === filterFreq;
            });
        }
        if (filtered.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhuma verificação encontrada.</p>';
            return;
        }
        container.innerHTML = `
            <table>
                <thead><tr><th>Data da Verificação</th><th>Código</th><th>Descrição</th><th>Frequência</th><th>Ações</th></tr></thead>
                <tbody>
                ${filtered.map(v => {
                    const p = planilhas.find(pl => pl.id === v.planilhaId);
                    if (!p) return ''; 
                    return `<tr>
                        <td>${formatDate(v.dataVerificacao)}</td><td>${p.codigo}</td>
                        <td>${p.descricao}</td><td>${p.frequencia}</td>
                        <td class="actions">
                            <button class="btn-revert" title="Reverter Verificação" onclick="reverterVerificacao(${v.id})">${icons.revert}</button>
                        </td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>`;
    };

    const renderClients = () => {
        const container = document.getElementById('client-list-container');
         const tableHTML = `
            <table>
                <thead><tr><th>Nome do Cliente</th><th>Ações</th></tr></thead>
                <tbody>
                    ${clients.map(c => `
                        <tr>
                            <td>${c.name}</td>
                            <td class="actions">
                                <button class="btn-edit" title="Editar" onclick="abrirClientModal(${c.id})">${icons.edit}</button>
                                <button class="btn-delete" title="Excluir" onclick="deletarCliente(${c.id})">${icons.delete}</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        container.innerHTML = tableHTML;
    };
    
    const updateDashboard = () => {
        let counts = { ok: 0, pending: 0, overdue: 0 };
        const activeReminders = [];
        const planilhasDigitais = planilhas.filter(p => p.arquivamento === 'Qualysys');

        planilhasDigitais.forEach(p => {
            const status = getStatus(p);
            if (status.class === 'status-ok') counts.ok++;
            else if (status.class === 'status-pending' || status.class === 'status-anotacao') counts.pending++;
            else if (status.class === 'status-overdue') counts.overdue++;
            
            if (p.pendencia?.tipo === 'anotacao' || status.class === 'status-overdue') {
                activeReminders.push({ type: 'pendencia', data: p, status });
            }
        });

        lembretes.filter(l => !l.concluido).forEach(l => {
            const p = planilhas.find(pl => pl.id === l.planilhaId);
            if(p) activeReminders.push({ type: 'lembrete', data: l, planilha: p });
        });

        document.getElementById('count-ok').textContent = counts.ok;
        document.getElementById('count-pending').textContent = counts.pending + lembretes.filter(l => !l.concluido).length;
        document.getElementById('count-overdue').textContent = counts.overdue;
        
        const remindersList = document.getElementById('reminders-list');
        remindersList.innerHTML = '';
        if (activeReminders.length === 0) {
             remindersList.innerHTML = '<li>Nenhuma anotação ou pendência.</li>'; return;
        }
        activeReminders.forEach(item => {
            const li = document.createElement('li');
            if (item.type === 'pendencia') {
                li.innerHTML = `<div class="reminder-header"><span><strong>${item.data.codigo}</strong></span> <span class="status-badge ${item.status.class}">${item.status.text}</span></div>`;
                if (item.data.pendencia?.tipo === 'anotacao') {
                    li.innerHTML += `<div class="reminder-note">${item.data.pendencia.texto}</div>`;
                }
            } else if (item.type === 'lembrete') {
                 li.innerHTML = `
                    <div class="reminder-header">
                        <span><strong>${item.planilha.codigo}</strong> - Lembrete</span>
                        <span class="status-badge status-reminder">Ação Futura</span>
                    </div>
                    <div class="reminder-note" style="display:flex; justify-content: space-between; align-items: center;">
                        <div>
                            ${item.data.texto} <br> 
                            <span class="reminder-deadline">Prazo: ${formatDate(item.data.prazo)}</span>
                        </div>
                        <button class="btn btn-success btn-concluir-lembrete" onclick="concluirLembrete(${item.data.id})">Concluir</button>
                    </div>`;
            }
            remindersList.appendChild(li);
        });
    };
    
    // --- LÓGICA DOS MODALS ---
    const modals = document.querySelectorAll('.modal');
    const openModal = (modalId) => document.getElementById(modalId).style.display = 'block';
    const closeModal = () => modals.forEach(m => m.style.display = 'none');
    document.querySelectorAll('.close-button').forEach(btn => btn.onclick = closeModal);

    window.abrirPlanilhaModal = (id = null) => {
        document.getElementById('planilhaForm').reset();
        if (id) {
            const p = planilhas.find(pl => pl.id === id);
            document.getElementById('planilhaModalTitle').textContent = 'Editar Planilha';
            document.getElementById('planilhaId').value = p.id;
            document.getElementById('codigo').value = p.codigo;
            document.getElementById('descricao').value = p.descricao;
            document.getElementById('frequencia').value = p.frequencia;
            document.getElementById('arquivamento').value = p.arquivamento;
            document.getElementById('monitor').value = p.monitor;
        } else {
            document.getElementById('planilhaModalTitle').textContent = 'Adicionar Nova Planilha';
            document.getElementById('planilhaId').value = '';
        }
        openModal('planilhaModal');
    };

    window.abrirPendencyModal = (id) => {
         const p = planilhas.find(pl => pl.id === id);
        document.getElementById('pendencyForm').reset();
        document.getElementById('pendencyPlanilhaId').value = id;
        document.getElementById('pendencyPlanilhaDesc').textContent = p.descricao;
        openModal('pendencyModal');
    };

    window.abrirReminderModal = (id) => {
        const p = planilhas.find(pl => pl.id === id);
        document.getElementById('reminderForm').reset();
        document.getElementById('reminderPlanilhaId').value = id;
        document.getElementById('reminderPlanilhaDesc').textContent = p.descricao;
        openModal('reminderModal');
    };

    window.abrirClientModal = (id = null) => {
        document.getElementById('clientForm').reset();
        if (id) {
            const c = clients.find(cl => cl.id === id);
            document.getElementById('clientModalTitle').textContent = 'Editar Cliente';
            document.getElementById('clientId').value = c.id;
            document.getElementById('clientName').value = c.name;
        } else {
            document.getElementById('clientModalTitle').textContent = 'Adicionar Novo Cliente';
            document.getElementById('clientId').value = '';
        }
        openModal('clientModal');
    };
    
    // --- MANIPULAÇÃO DE DADOS ---
    const saveClients = () => {
        localStorage.setItem(`${APP_PREFIX}_clients`, JSON.stringify(clients));
        populateClientSelector();
        renderClients();
    };

    const savePlanilhas = () => {
        if (!currentClientId) return;
        localStorage.setItem(`${APP_PREFIX}_planilhas_${currentClientId}`, JSON.stringify(planilhas));
        renderAll();
    };

    const saveConcluidas = () => {
        if (!currentClientId) return;
        localStorage.setItem(`${APP_PREFIX}_concluidas_${currentClientId}`, JSON.stringify(verificacoesConcluidas));
        renderAll();
    }

    const saveLembretes = () => {
        if (!currentClientId) return;
        localStorage.setItem(`${APP_PREFIX}_lembretes_${currentClientId}`, JSON.stringify(lembretes));
        renderAll();
    }

    window.marcarVerificada = (id) => {
        const index = planilhas.findIndex(p => p.id === id);
        if(index > -1) {
            const hoje = new Date().toISOString().split('T')[0];
            planilhas[index].ultimaVerificacao = hoje;
            planilhas[index].pendencia = null; 
            
            verificacoesConcluidas.push({
                id: Date.now(),
                planilhaId: id,
                dataVerificacao: hoje
            });

            savePlanilhas();
            saveConcluidas();
        }
    };

    window.reverterVerificacao = (verificacaoId) => {
        if (!confirm('Tem certeza que deseja reverter esta verificação?')) { return; }
        const vIndex = verificacoesConcluidas.findIndex(v => v.id == verificacaoId);
        if (vIndex === -1) return;
        const pId = verificacoesConcluidas[vIndex].planilhaId;
        verificacoesConcluidas.splice(vIndex, 1);
        const pIndex = planilhas.findIndex(p => p.id == pId);
        if (pIndex > -1) {
            const remaining = verificacoesConcluidas
                .filter(v => v.planilhaId == pId)
                .sort((a, b) => new Date(b.dataVerificacao) - new Date(a.dataVerificacao));
            planilhas[pIndex].ultimaVerificacao = remaining.length > 0 ? remaining[0].dataVerificacao : null;
        }
        savePlanilhas();
        saveConcluidas();
    };

    window.concluirLembrete = (id) => {
         const index = lembretes.findIndex(l => l.id === id);
        if(index > -1) {
            lembretes[index].concluido = true;
            saveLembretes();
        }
    };

    document.getElementById('planilhaForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('planilhaId').value;
        const data = {
            codigo: document.getElementById('codigo').value.trim(),
            descricao: document.getElementById('descricao').value.trim(),
            frequencia: document.getElementById('frequencia').value,
            arquivamento: document.getElementById('arquivamento').value,
            monitor: document.getElementById('monitor').value.trim(),
        };
        if (id) {
            const index = planilhas.findIndex(p => p.id == id);
            planilhas[index] = { ...planilhas[index], ...data };
        } else {
            planilhas.push({ id: Date.now(), ...data, ultimaVerificacao: null, pendencia: null });
        }
        savePlanilhas();
        closeModal();
    });
    
    document.getElementById('pendencyForm').addEventListener('submit', (e) => {
         e.preventDefault();
        const id = document.getElementById('pendencyPlanilhaId').value;
        const index = planilhas.findIndex(p => p.id == id);
        if (index > -1) {
            planilhas[index].pendencia = {
                tipo: document.getElementById('pendencyType').value,
                texto: document.getElementById('pendencyJustification').value
            };
        }
        savePlanilhas();
        closeModal();
    });

    document.getElementById('reminderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const planilhaId = document.getElementById('reminderPlanilhaId').value;
        const newLembrete = {
            id: Date.now(),
            planilhaId: parseInt(planilhaId),
            texto: document.getElementById('reminderText').value,
            prazo: document.getElementById('reminderPrazo').value,
            concluido: false
        };
        lembretes.push(newLembrete);
        saveLembretes();
        closeModal();
    });

    document.getElementById('clientForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('clientId').value;
        const name = document.getElementById('clientName').value.trim();
        if(id) {
            const index = clients.findIndex(c => c.id == id);
            clients[index].name = name;
        } else {
            clients.push({ id: Date.now(), name: name });
        }
        saveClients();
        closeModal();
    });

    window.deletarPlanilha = (id) => {
        if (confirm('Tem certeza? Lembretes e verificações concluídas associadas a ela também serão removidos.')) {
            planilhas = planilhas.filter(p => p.id !== id);
            verificacoesConcluidas = verificacoesConcluidas.filter(v => v.planilhaId !== id);
            lembretes = lembretes.filter(l => l.planilhaId !== id);
            savePlanilhas();
            saveConcluidas();
            saveLembretes();
        }
    };

    window.deletarCliente = (id) => {
        const client = clients.find(c => c.id === id);
        if (confirm(`Tem certeza que deseja excluir o cliente "${client.name}"? TODOS os dados associados a ele serão perdidos permanentemente.`)) {
            clients = clients.filter(c => c.id !== id);
            localStorage.removeItem(`${APP_PREFIX}_planilhas_${id}`);
            localStorage.removeItem(`${APP_PREFIX}_concluidas_${id}`);
            localStorage.removeItem(`${APP_PREFIX}_lembretes_${id}`);
            
            if (currentClientId == id) {
                localStorage.removeItem(`${APP_PREFIX}_currentClientId`);
                location.reload();
            } else {
                saveClients();
            }
        }
    };

    // --- NAVEGAÇÃO E EVENTOS ---
    const navLinks = document.querySelectorAll('.sidebar nav li');
    const pages = document.querySelectorAll('.page');
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    const changePage = (pageId) => {
        pages.forEach(p => p.classList.remove('active'));
        navLinks.forEach(l => l.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
        document.querySelector(`li[data-page="${pageId}"]`).classList.add('active');
        if(currentClientId || pageId === 'clientes') {
             renderAll();
        }
    };

    navLinks.forEach(link => link.addEventListener('click', () => changePage(link.dataset.page)));
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabContents.forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });
    
    document.getElementById('addPlanilhaBtn').addEventListener('click', () => abrirPlanilhaModal());
    document.getElementById('addClientBtn').addEventListener('click', () => abrirClientModal());
    document.getElementById('filterVerifiedDate').addEventListener('change', renderVerificadas);
    document.getElementById('filterVerifiedFreq').addEventListener('change', renderVerificadas);

    document.getElementById('exportCsvBtn').addEventListener('click', () => {
        let csvContent = "data:text/csv;charset=utf-8,Status,Codigo,Descricao,Frequencia,Arquivamento,Monitor,UltimaVerificacao\n";
        planilhas.forEach(p => {
            const status = getStatus(p).text;
            const ultima = formatDate(p.ultimaVerificacao);
            const row = [status, p.codigo, `"${p.descricao}"`, p.frequencia, p.arquivamento, p.monitor, ultima].join(',');
            csvContent += row + "\r\n";
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `relatorio_sca_${clientSelector.options[clientSelector.selectedIndex].text}.csv`);
        link.click();
    });

    document.getElementById('clearDataBtn').addEventListener('click', () => {
        if (confirm('ATENÇÃO! Esta ação irá apagar TODOS os dados de TODOS os clientes. Deseja continuar?')) {
            localStorage.clear();
            location.reload();
        }
    });
    
    // --- INICIALIZAÇÃO ---
    initializeData();
});
</script>
</body>
</html>
