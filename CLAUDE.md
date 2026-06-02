# Açaí Rapidola — Instruções para Claude

## Render: economizar pipeline minutes

O plano Hobby do Render inclui **500 pipeline minutes por mês**. Cada push no GitHub dispara um build+deploy que consome ~3–5 minutos.

**Regra: nunca fazer push a cada modificação pequena.**

Agrupe todas as alterações de uma sessão em um único push no final. Fluxo correto:

1. Fazer quantos commits locais forem necessários (`git commit`)
2. Só fazer `git push` quando o conjunto de mudanças estiver pronto para ir ao ar
3. Se precisar de vários pushes na mesma sessão (ex: bug crítico encontrado depois), tudo bem — mas evitar push por push a cada ajuste

**Exceção:** quando o usuário pedir explicitamente para subir algo urgente ou testar em produção.

## SW: bumpar versão a cada push

Sempre que fizer push com mudanças em arquivos JS/JSX do cliente, bumpar `STATIC_V` em `client/public/sw.js` (ex: v10 → v11). Sem isso o cliente não recebe o código novo.
