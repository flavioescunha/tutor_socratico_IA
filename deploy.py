import os
import subprocess
import sys

def increment_version(version_str):
    parts = version_str.strip().split('.')
    if len(parts) != 3:
        # Padrão caso o arquivo esteja mal formatado
        return "1.0.0"
    
    # Incrementa a última casa (Patch)
    parts[2] = str(int(parts[2]) + 1)
    return ".".join(parts)

def main():
    version_file = "VERSION"
    
    # Ler a versão atual
    if os.path.exists(version_file):
        with open(version_file, "r") as f:
            current_version = f.read().strip()
    else:
        current_version = "1.0.0"
        
    print(f"=====================================")
    print(f"🚀 Iniciando Deploy para o GitHub")
    print(f"=====================================")
    print(f"📦 Versão atual: {current_version}")
    
    new_version = increment_version(current_version)
    print(f"✨ Nova versão : {new_version}\n")
    
    # Escrever a nova versão
    with open(version_file, "w") as f:
        f.write(new_version)
        
    # Comandos do Git
    try:
        # Verifica se o repositório existe, se não, inicializa
        if not os.path.exists(".git"):
            print("[+] Inicializando repositório Git local...")
            subprocess.run(["git", "init"], check=True)
            subprocess.run(["git", "branch", "-M", "main"], check=True)
            
        print("[+] Adicionando modificações...")
        subprocess.run(["git", "add", "."], check=True)
        
        print("[+] Criando commit...")
        subprocess.run(["git", "commit", "-m", f"v{new_version} - Atualizacao automatica"], check=True)
        
        # Verifica se existe um repositório remoto cadastrado
        remotes = subprocess.run(["git", "remote"], capture_output=True, text=True).stdout
        if "origin" not in remotes:
            print("\n⚠️ Nenhum repositório GitHub (origin) foi encontrado!")
            print("Crie um repositório vazio no GitHub e cole a URL dele aqui.")
            print("Exemplo: https://github.com/SeuUsuario/TutorSocr.git")
            repo_url = input("URL do repositório (ou deixe em branco para cancelar): ").strip()
            
            if repo_url:
                subprocess.run(["git", "remote", "add", "origin", repo_url], check=True)
            else:
                print("\n❌ Push cancelado pelo usuário. A versão foi atualizada apenas no seu computador.")
                sys.exit(0)
                
        print("\n[+] Enviando código para o GitHub (Push)...")
        # Faz push e sincroniza com a main
        subprocess.run(["git", "push", "-u", "origin", "main"], check=True)
        
        print(f"\n✅ SUCESSO! Aplicativo atualizado para a versão {new_version} e publicado no GitHub!")
        
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Erro crítico ao executar comandos do Git: {e}")
        # Reverte a versão se deu erro no git
        with open(version_file, "w") as f:
            f.write(current_version)
        print("A versão foi revertida para garantir integridade.")
    except FileNotFoundError:
        print("\n❌ Erro: O 'git' não está instalado ou não está configurado nas variáveis de ambiente.")
        print("Por favor, instale o Git for Windows (https://git-scm.com/download/win).")
        # Reverte a versão
        with open(version_file, "w") as f:
            f.write(current_version)

if __name__ == "__main__":
    main()
