param (
    [Parameter(Mandatory=$true)]
    [string]$CommitMessage
)

Write-Host "1. Sincronizando com o GitHub..."
git add .
git commit -m $CommitMessage
git push

Write-Host "2. Sincronizando arquivos com o Google Apps Script (HEAD)..."
npx clasp push

Write-Host "3. Atualizando a implantação publicada (Deployment) no Google Apps Script..."
# O ID abaixo é o da implantação principal que está ativa para os alunos.
npx clasp deploy -i AKfycby0BTBAuOOUouaV_Hdo3e47T_rSPXhUSGoeRwiRjA4JJ81KpRGnk28RJ6nSUhshxtWVcw -d $CommitMessage

Write-Host "Deploy concluído com sucesso!"
