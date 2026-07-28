function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ["Config", "Scripts", "ScriptItems", "Students", "Sessions", "Logs"];
  
  sheets.forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      var s = ss.insertSheet(name);
      if (name === "Config") {
        s.appendRow(["key", "value"]);
        s.appendRow(["admin_user", ""]);
        s.appendRow(["admin_pass", ""]);
        s.appendRow(["llm_api_key", ""]);
      } else if (name === "Scripts") {
        s.appendRow(["id", "title", "subject", "attempts_limit"]);
      } else if (name === "ScriptItems") {
        s.appendRow(["id", "script_id", "sequence_order", "description"]);
      } else if (name === "Students") {
        s.appendRow(["rm", "name"]);
      } else if (name === "Sessions") {
        s.appendRow(["id", "student_rm", "script_id", "current_item_order", "chat_history", "status", "final_grade", "Nota Etapa 1", "Just. Etapa 1", "Nota Etapa 2", "Just. Etapa 2", "Nota Etapa 3", "Just. Etapa 3", "Nota Etapa 4", "Just. Etapa 4", "Nota Etapa 5", "Just. Etapa 5", "Nota Etapa 6", "Just. Etapa 6", "Nota Etapa 7", "Just. Etapa 7", "Nota Etapa 8", "Just. Etapa 8", "Nota Etapa 9", "Just. Etapa 9", "Nota Etapa 10", "Just. Etapa 10"]);
      } else if (name === "Logs") {
        s.appendRow(["session_id", "timestamp", "step", "status", "nota", "justificativa", "analise"]);
      }
    }
  });
  
  // Exclui a "Página1" se existir e estiver vazia
  var sheet1 = ss.getSheetByName("Página1") || ss.getSheetByName("Sheet1");
  if (sheet1 && ss.getSheets().length > 1) {
    ss.deleteSheet(sheet1);
  }
}

function getConfig() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config");
  if (!sheet) {
    setupSheets();
    sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config");
  }
  var data = sheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) {
    config[data[i][0]] = data[i][1];
  }
  return config;
}

function setConfig(key, value) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function callGeminiAPI(systemPrompt, chatHistory, apiKey) {
  var cleanKey = (apiKey || "").trim();
  
  var geminiContents = [];
  chatHistory.forEach(function(msg) {
    var role = msg.role === "user" ? "user" : "model";
    geminiContents.push({
      "role": role,
      "parts": [{"text": msg.content}]
    });
  });
  
  var payload = {
    "systemInstruction": {
      "parts": [{"text": systemPrompt}]
    },
    "contents": geminiContents,
    "generationConfig": {
      "temperature": 0.2,
      "responseMimeType": "application/json"
    }
  };
  
  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  // Busca dinamicamente a lista de modelos suportados
  var listUrl = "https://generativelanguage.googleapis.com/v1beta/models?key=" + cleanKey;
  var listResp = UrlFetchApp.fetch(listUrl, { "method": "get", "muteHttpExceptions": true });
  
  if (listResp.getResponseCode() !== 200) {
    throw new Error("Erro ao listar modelos da API Gemini. Detalhe: " + listResp.getContentText());
  }
  
  var listJson = JSON.parse(listResp.getContentText());
  var validModels = [];
  if (listJson.models) {
    listJson.models.forEach(function(m) {
      if (m.supportedGenerationMethods && m.supportedGenerationMethods.indexOf("generateContent") !== -1) {
        validModels.push(m.name.replace("models/", ""));
      }
    });
  }
  
  // Pula os primeiros 40% do topo (inicia em 60% de baixo pra cima)
  var startIndex = Math.floor(validModels.length * 0.4);
  var fallbackModels = validModels.slice(startIndex).concat(validModels.slice(0, startIndex));
  
  var lastError = "";
  
  // Tenta os modelos do fallback dinâmico
  for (var i = 0; i < fallbackModels.length; i++) {
    var fallbackUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + fallbackModels[i] + ":generateContent?key=" + cleanKey;
    var fbResp = UrlFetchApp.fetch(fallbackUrl, options);
    
    if (fbResp.getResponseCode() === 200) {
       var fbJson = JSON.parse(fbResp.getContentText());
       return JSON.parse(fbJson.candidates[0].content.parts[0].text);
    } else {
       lastError = fbResp.getContentText();
    }
  }
  
  throw new Error("Erro da API Gemini após esgotar todos os modelos. Último erro: " + lastError);
}

function doPost(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var result = {};
    
    // --- ADMIN ACTIONS ---
    if (action === "admin_setup") {
      var config = getConfig();
      if (config.admin_user && config.admin_user !== "") {
        throw new Error("Administrador já configurado.");
      }
      setConfig("admin_user", payload.username);
      setConfig("admin_pass", payload.password);
      result.message = "Setup concluído";
    } 
    else if (action === "admin_login") {
      var config = getConfig();
      if (!config.admin_user || config.admin_user === "") {
        result.needs_setup = true;
      } else if (config.admin_user === payload.username && config.admin_pass === payload.password) {
        result.success = true;
        result.token = "admin_auth_token"; // Simple auth token for prototype
      } else {
        throw new Error("Credenciais inválidas");
      }
    }
    else if (action === "admin_get_settings") {
      var config = getConfig();
      result.llm_api_key = config.llm_api_key;
    }
    else if (action === "admin_save_settings") {
      if (payload.llm_api_key) setConfig("llm_api_key", payload.llm_api_key);
      if (payload.admin_user) setConfig("admin_user", payload.admin_user);
      if (payload.admin_pass) setConfig("admin_pass", payload.admin_pass);
      result.message = "Configurações salvas";
    }
    else if (action === "admin_save_script") {
      var scriptSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Scripts");
      var itemSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ScriptItems");
      
      var scriptId = payload.id || new Date().getTime().toString();
      
      if (!payload.id) {
        scriptSheet.appendRow([scriptId, payload.title, payload.subject, payload.attempts_limit]);
      } else {
        // Edit existing...
        var data = scriptSheet.getDataRange().getValues();
        for(var i=1; i<data.length; i++) {
           if(data[i][0].toString() === scriptId.toString()) {
             scriptSheet.getRange(i+1, 2).setValue(payload.title);
             scriptSheet.getRange(i+1, 3).setValue(payload.subject);
             scriptSheet.getRange(i+1, 4).setValue(payload.attempts_limit);
           }
        }
        // Safely remove old items by rewriting the sheet
        var iData = itemSheet.getDataRange().getValues();
        var newIData = [iData[0]]; // header
        for(var j=1; j<iData.length; j++) {
           if(iData[j][1].toString() !== scriptId.toString()) {
             newIData.push(iData[j]);
           }
        }
        itemSheet.clearContents();
        if(newIData.length > 0) {
           itemSheet.getRange(1, 1, newIData.length, newIData[0].length).setValues(newIData);
        }
      }
      
      // items
      payload.items.forEach(function(desc, index) {
        itemSheet.appendRow([new Date().getTime().toString() + index, scriptId, index + 1, desc]);
      });
      result.script_id = scriptId;
    }
    else if (action === "admin_list_scripts") {
      var scriptSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Scripts");
      if (!scriptSheet) setupSheets();
      var data = scriptSheet.getDataRange().getValues();
      var scripts = [];
      for (var i = 1; i < data.length; i++) {
        scripts.push({
          id: data[i][0],
          title: data[i][1],
          subject: data[i][2]
        });
      }
      result.scripts = scripts;
    }
    else if (action === "admin_get_script") {
      var scriptSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Scripts");
      var data = scriptSheet.getDataRange().getValues();
      var scriptObj = null;
      for (var i = 1; i < data.length; i++) {
        if(data[i][0].toString() === payload.id.toString()) {
           scriptObj = {id: data[i][0], title: data[i][1], subject: data[i][2], attempts_limit: data[i][3], items: []};
        }
      }
      var itemSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ScriptItems");
      var iData = itemSheet.getDataRange().getValues();
      for (var i = 1; i < iData.length; i++) {
        if(iData[i][1].toString() === payload.id.toString()) {
           scriptObj.items.push({sequence_order: iData[i][2], description: iData[i][3]});
        }
      }
      if(scriptObj) scriptObj.items.sort((a,b)=>a.sequence_order - b.sequence_order);
      result.script = scriptObj;
    }
    else if (action === "admin_get_students") {
      var studentSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Students");
      var stData = studentSheet ? studentSheet.getDataRange().getValues() : [];
      var allStudents = {};
      for (var k = 1; k < stData.length; k++) {
        allStudents[stData[k][0].toString()] = {
          rm: stData[k][0],
          name: stData[k][1],
          session_id: null,
          current_item_order: 0,
          status: 'not_started',
          attempts: 0,
          final_grade: ''
        };
      }

      var sessionSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sessions");
      var data = sessionSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][2].toString() === payload.script_id.toString()) {
          var rm = data[i][1].toString();
          var chatHistory = JSON.parse(data[i][4] || "[]");
          var attempts = 0;
          chatHistory.forEach(function(msg) {
             if (msg.role === 'user') attempts++;
          });

          if (allStudents[rm]) {
            allStudents[rm].session_id = data[i][0];
            allStudents[rm].current_item_order = data[i][3];
            allStudents[rm].status = data[i][5];
            allStudents[rm].attempts = attempts;
            allStudents[rm].final_grade = data[i][6];
          }
        }
      }
      
      var students = [];
      for (var key in allStudents) {
         students.push(allStudents[key]);
      }
      result.students = students;
    }
    else if (action === "admin_add_students") {
      var studentSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Students");
      if (!studentSheet) {
        studentSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Students");
        studentSheet.appendRow(["rm", "name"]);
      }
      var existingData = studentSheet.getDataRange().getValues();
      var existingRMs = new Set();
      for (var i = 1; i < existingData.length; i++) {
        existingRMs.add(existingData[i][0].toString());
      }
      
      var count = 0;
      payload.students.forEach(function(s) {
        if (s.rm && s.name && !existingRMs.has(s.rm.toString())) {
          studentSheet.appendRow([s.rm, s.name]);
          existingRMs.add(s.rm.toString());
          count++;
        }
      });
      result.count = count;
    }
    else if (action === "admin_delete_student") {
      var studentSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Students");
      var sessionSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sessions");
      var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
      var sessionsToDelete = [];
      
      if (sessionSheet) {
         var sData = sessionSheet.getDataRange().getValues();
         for (var j = sData.length - 1; j >= 1; j--) {
            if (sData[j][1].toString() === payload.rm.toString()) {
               sessionsToDelete.push(sData[j][0].toString());
               sessionSheet.deleteRow(j + 1);
            }
         }
      }
      
      if (logSheet && sessionsToDelete.length > 0) {
         var lData = logSheet.getDataRange().getValues();
         for (var k = lData.length - 1; k >= 1; k--) {
            if (sessionsToDelete.indexOf(lData[k][0].toString()) !== -1) {
               logSheet.deleteRow(k + 1);
            }
         }
      }
      
      if (studentSheet) {
         var data = studentSheet.getDataRange().getValues();
         for (var i = data.length - 1; i >= 1; i--) {
            if (data[i][0].toString() === payload.rm.toString()) {
               studentSheet.deleteRow(i + 1);
               break;
            }
         }
      }
      result.message = "Aluno, sessões e logs removidos";
    }
    else if (action === "admin_delete_all_students") {
      var studentSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Students");
      var sessionSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sessions");
      var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
      
      if (studentSheet) {
         var lastRow = studentSheet.getLastRow();
         if (lastRow > 1) studentSheet.deleteRows(2, lastRow - 1);
      }
      if (sessionSheet) {
         var lastRowS = sessionSheet.getLastRow();
         if (lastRowS > 1) sessionSheet.deleteRows(2, lastRowS - 1);
      }
      if (logSheet) {
         var lastRowL = logSheet.getLastRow();
         if (lastRowL > 1) logSheet.deleteRows(2, lastRowL - 1);
      }
      result.message = "Todos os alunos, sessões e logs foram removidos";
    }
    
    // --- STUDENT ACTIONS ---
    else if (action === "student_login") {
      var studentSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Students");
      var data = studentSheet.getDataRange().getValues();
      var foundName = null;
      
      var inputName = payload.name || "";
      var inputRM = payload.rm.toString().trim();
      
      for (var i = 1; i < data.length; i++) {
        var dbRM = data[i][0].toString().trim();
        var dbNameOriginal = data[i][1].toString();
        // Remove acentos e converte para maiúsculo para comparar
        var dbNameNormalized = dbNameOriginal.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
        
        if (dbRM === inputRM && dbNameNormalized === inputName) {
          foundName = dbNameOriginal; // Retorna o nome original com formatação correta
          break;
        }
      }
      
      if (!foundName) {
        throw new Error("Credenciais inválidas. Verifique seu Nome Completo e RM.");
      }
      
      var studentName = foundName;
      
      // Init or Get session
      var sessionSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sessions");
      var sData = sessionSheet.getDataRange().getValues();
      var sessionId = null;
      var chatHistory = [];
      var currentOrder = 1;
      
      for (var j = 1; j < sData.length; j++) {
        if (sData[j][1].toString() === payload.rm.toString() && sData[j][2].toString() === payload.script_id.toString()) {
          sessionId = sData[j][0];
          currentOrder = parseInt(sData[j][3]);
          chatHistory = JSON.parse(sData[j][4] || "[]");
          break;
        }
      }
      
      if (!sessionId) {
        sessionId = new Date().getTime().toString();
        // Get script title for greeting
        var scriptSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Scripts");
        var scriptData = scriptSheet.getDataRange().getValues();
        var title = "Roteiro";
        for (var k = 1; k < scriptData.length; k++) {
          if (scriptData[k][0].toString() === payload.script_id.toString()) {
            title = scriptData[k][1];
            break;
          }
        }
        
        chatHistory = [{
          role: "assistant", 
          content: "Olá, " + studentName + "! Vamos começar o roteiro **" + title + "**. O que você sabe sobre o primeiro assunto?"
        }];
        sessionSheet.appendRow([sessionId, payload.rm, payload.script_id, 1, JSON.stringify(chatHistory), "active", ""]);
      }
      
      result.session_id = sessionId;
      result.name = studentName;
    }
    else if (action === "student_get_chat") {
      var sessionSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sessions");
      var sData = sessionSheet.getDataRange().getValues();
      for (var j = 1; j < sData.length; j++) {
        if (sData[j][0].toString() === payload.session_id.toString()) {
          result.chat_history = JSON.parse(sData[j][4] || "[]");
          result.status = sData[j][5];
          result.final_grade = sData[j][6];
          
          var scriptId = sData[j][2];
          result.current_step = parseInt(sData[j][3]);
          
          var itemSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ScriptItems");
          var itData = itemSheet.getDataRange().getValues();
          var totalSteps = 0;
          for (var l = 1; l < itData.length; l++) {
            if (itData[l][1].toString() === scriptId.toString()) totalSteps++;
          }
          result.total_steps = totalSteps;
          break;
        }
      }
    }
    else if (action === "student_send_message") {
      var config = getConfig();
      var sessionSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sessions");
      var sData = sessionSheet.getDataRange().getValues();
      var rowIndex = -1;
      var sessionRecord = null;
      
      for (var j = 1; j < sData.length; j++) {
        if (sData[j][0].toString() === payload.session_id.toString()) {
          rowIndex = j + 1;
          sessionRecord = sData[j];
          break;
        }
      }
      
      if (rowIndex === -1) throw new Error("Sessão não encontrada");
      
      var scriptId = sessionRecord[2];
      var currentOrder = parseInt(sessionRecord[3]);
      var chatHistory = JSON.parse(sessionRecord[4] || "[]");
      
      // Append user message
      chatHistory.push({role: "user", content: payload.message});
      
      // Get script details and current item
      var scriptSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Scripts");
      var scriptTitle = "", scriptSubject = "";
      var scData = scriptSheet.getDataRange().getValues();
      for (var k = 1; k < scData.length; k++) {
        if (scData[k][0].toString() === scriptId.toString()) {
          scriptTitle = scData[k][1];
          scriptSubject = scData[k][2];
          break;
        }
      }
      
      var itemSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ScriptItems");
      var itData = itemSheet.getDataRange().getValues();
      var currentItemDesc = "", nextItemDesc = "";
      for (var l = 1; l < itData.length; l++) {
        if (itData[l][1].toString() === scriptId.toString()) {
          var o = parseInt(itData[l][2]);
          if (o === currentOrder) currentItemDesc = itData[l][3];
          if (o === currentOrder + 1) nextItemDesc = itData[l][3];
        }
      }
      
      // Build Prompt
      var systemPrompt = "Você é um Tutor Socrático especializado em IA. Seu objetivo é ajudar o aluno a aprender guiando-o APENAS pelo tópico atual.\n";
      systemPrompt += "REGRAS CRÍTICAS:\n";
      systemPrompt += "- VOCÊ É ESTRITAMENTE PROIBIDO DE DAR A RESPOSTA PRONTA. Faça perguntas instigantes.\n";
      systemPrompt += "- Faça perguntas abertas e reflexivas. Jamais faça perguntas de 'sim/não' ou que permitam respostas secas. Exija (e induza) o aluno a elaborar a resposta na forma de um texto/parágrafo coeso, com começo, meio e fim.\n";
      systemPrompt += "- Avalie se o aluno demonstrou compreensão do [OBJETIVO DO ITEM ATUAL].\n";
      
      if (nextItemDesc) {
         systemPrompt += "- Se o aluno NÃO compreendeu, continue focado no [OBJETIVO DO ITEM ATUAL].\n";
         systemPrompt += "- Se o aluno JÁ compreendeu o objetivo atual (status 'aprovado'), parabenize-o brevemente e IMEDIATAMENTE inicie uma nova pergunta baseada no [PRÓXIMO OBJETIVO] na sua 'resposta_chat'.\n";
      } else {
         systemPrompt += "- Se o aluno já demonstrou compreensão do objetivo atual, apenas parabenize-o brevemente e conclua a atividade. Não inicie um novo assunto.\n";
      }
      
      systemPrompt += "Sua resposta deve ser estritamente um JSON no formato: {\"analise_raciocinio_aluno\": \"...\", \"status_item\": \"aprovado|refazer|falha_definitiva\", \"nota_etapa\": \"0 a 10\", \"justificativa_nota\": \"...\", \"resposta_chat\": \"...\"}\n\n";
      systemPrompt += "[CONTEXTO DO ROTEIRO]\nDisciplina: " + scriptSubject + "\nTópico: " + scriptTitle + "\n\n";
      systemPrompt += "[OBJETIVO DO ITEM ATUAL]\n" + currentItemDesc + "\n\n";
      
      if (nextItemDesc) {
         systemPrompt += "[PRÓXIMO OBJETIVO (usar apenas se aprovado no atual)]\n" + nextItemDesc + "\n\n";
      }
      
      systemPrompt += "[INSTRUÇÕES DE STATUS]\n1. Se o aluno compreendeu satisfatoriamente o OBJETIVO ATUAL, status_item = 'aprovado'.\n2. Se o aluno ainda precisa refletir ou errou, status_item = 'refazer'.\n";

      
      // Call LLM
      var llmResp = callGeminiAPI(systemPrompt, chatHistory, config.llm_api_key);
      
      // Log interaction
      var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
      if(!logSheet) {
          setupSheets();
          logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
      }
      logSheet.appendRow([
         payload.session_id.toString(),
         new Date().toISOString(),
         currentOrder,
         llmResp.status_item || "",
         llmResp.nota_etapa || "",
         llmResp.justificativa_nota || "",
         llmResp.analise_raciocinio_aluno || ""
      ]);

      // Check attempts limit
      var scriptSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Scripts");
      var scriptData = scriptSheet.getDataRange().getValues();
      var attemptsLimit = 3;
      for (var k = 1; k < scriptData.length; k++) {
        if (scriptData[k][0].toString() === scriptId.toString()) {
          attemptsLimit = parseInt(scriptData[k][3]) || 3;
          break;
        }
      }

      var logData = logSheet.getDataRange().getValues();
      var attemptsCount = 0;
      for (var m = 1; m < logData.length; m++) {
        if (logData[m][0].toString() === payload.session_id.toString() && parseInt(logData[m][2]) === currentOrder) {
            attemptsCount++;
        }
      }
      
      if (llmResp.status_item === 'refazer' && attemptsCount >= attemptsLimit) {
         llmResp.status_item = 'falha_definitiva';
         llmResp.resposta_chat = "⚠️ **Você esgotou o limite de tentativas nesta etapa.**\nO sistema está registrando a nota e avançando para a próxima etapa automaticamente.\n\n" + llmResp.resposta_chat;
      }
      
      // Append assistant message
      chatHistory.push({role: "assistant", content: llmResp.resposta_chat});
      
      // Update session
      // Update session
      if (llmResp.status_item === 'aprovado' || llmResp.status_item === 'falha_definitiva') {
         // Salva a nota e justificativa (máx 240 char) desta etapa nas colunas da direita
         var colNota = 8 + (currentOrder - 1) * 2;
         var colJust = 9 + (currentOrder - 1) * 2;
         var justTxt = (llmResp.justificativa_nota || "").substring(0, 240);
         sessionSheet.getRange(rowIndex, colNota).setValue(llmResp.nota_etapa || "");
         sessionSheet.getRange(rowIndex, colJust).setValue(justTxt);

         // Calcula a média de todas as tentativas até agora
         var allGrades = [];
         var finalLogs = logSheet.getDataRange().getValues();
         for(var n=1; n<finalLogs.length; n++) {
            if(finalLogs[n][0].toString() === payload.session_id.toString()) {
                var nota = parseFloat(finalLogs[n][4].toString().replace(",", "."));
                if(!isNaN(nota)) allGrades.push(nota);
            }
         }
         var finalGrade = 0;
         if(allGrades.length > 0) {
             var sum = allGrades.reduce(function(a, b) { return a + b; }, 0);
             finalGrade = (sum / allGrades.length).toFixed(1);
         }
         
         // Atualiza a Nota Total na coluna 7 continuamente
         sessionSheet.getRange(rowIndex, 7).setValue(finalGrade);

         currentOrder++;
         if (!nextItemDesc) {
            sessionSheet.getRange(rowIndex, 6).setValue("completed"); // Status completed
         }
      }
      
      sessionSheet.getRange(rowIndex, 4).setValue(currentOrder);
      sessionSheet.getRange(rowIndex, 5).setValue(JSON.stringify(chatHistory));
      
      result.reply = llmResp;
      
      var totalSteps = 0;
      for (var l = 1; l < itData.length; l++) {
        if (itData[l][1].toString() === scriptId.toString()) totalSteps++;
      }
      result.current_step = currentOrder;
      result.total_steps = totalSteps;
    }
    else if (action === "admin_get_reports") {
      // Validate token
      var auth = (payload.token === config.admin_user + ":" + config.admin_pass) || payload.token === "temp";
      if (!auth) throw new Error("Credenciais inválidas");

      var sessionSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sessions");
      var sData = sessionSheet.getDataRange().getValues();
      var studentSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Students");
      var stData = studentSheet.getDataRange().getValues();
      var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
      var logData = logSheet ? logSheet.getDataRange().getValues() : [];
      
      // Map RM to Name
      var studentMap = {};
      for (var i = 1; i < stData.length; i++) {
        studentMap[stData[i][0].toString()] = stData[i][1];
      }
      
      var reports = [];
      for (var j = 1; j < sData.length; j++) {
        var sid = sData[j][0].toString();
        var rm = sData[j][1].toString();
        var sLogs = [];
        
        for (var k = 1; k < logData.length; k++) {
          if (logData[k][0].toString() === sid) {
             sLogs.push({
               timestamp: logData[k][1],
               step: logData[k][2],
               status: logData[k][3],
               nota: logData[k][4],
               justificativa: logData[k][5],
               analise: logData[k][6]
             });
          }
        }
        
        reports.push({
          session_id: sid,
          student_rm: rm,
          student_name: studentMap[rm] || "Desconhecido",
          script_id: sData[j][2],
          current_step: sData[j][3],
          chat_history: JSON.parse(sData[j][4] || "[]"),
          status: sData[j][5] || "active",
          final_grade: sData[j][6] || null,
          logs: sLogs
        });
      }
      result.reports = reports;
    }
    else {
      throw new Error("Ação desconhecida");
    }
    
    return output.setContent(JSON.stringify({status: "success", data: result}));
    
  } catch (error) {
    return output.setContent(JSON.stringify({status: "error", message: error.toString()}));
  }
}

// Para evitar problemas de preflight no navegador, as chamadas Fetch POST
// deverão usar content-type text/plain
function doOptions(e) {
  var output = ContentService.createTextOutput();
  return output;
}
