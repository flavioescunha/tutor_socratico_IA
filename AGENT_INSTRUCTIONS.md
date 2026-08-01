# Instruções de Deploy para a IA

Sempre que for solicitado fazer "deploy", "atualizar" ou "enviar as alterações" neste projeto, **NÃO utilize comandos manuais** (`git push`, `clasp push`, etc) separadamente.

Em vez disso, **SEMPRE execute o script `deploy.ps1`** localizado na raiz do projeto, passando a mensagem do commit como parâmetro:

```powershell
.\deploy.ps1 -CommitMessage "Descreva as alterações feitas"
```

**Motivo:** 
O comando `clasp push` apenas sobe o código para a versão HEAD no Google Apps Script (útil para desenvolvimento). No entanto, o aplicativo publicado (o link `/exec` que os usuários acessam) só será atualizado se uma nova implantação for gerada. O script `deploy.ps1` garante a execução correta das 3 etapas vitais:
1. Sincronização com o GitHub.
2. Atualização dos arquivos no ambiente do Apps Script.
3. Atualização da versão publicada (Deployment Oficial) para refletir instantaneamente as mudanças em produção.
