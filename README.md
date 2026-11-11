Um presente para quem ama animes, mas não encontra seu anime favorito dublado 🤍

📖 Sobre o Projeto
Este espaço foi criado com muito carinho para todos que, por qualquer motivo — dificuldade de acompanhar legendas, cansaço visual, distração, acessibilidade ou simplesmente porque preferem ouvir a história — querem assistir seus animes dublados, mas não têm essa opção porque o anime nunca foi dublado oficialmente. Não é um projeto grande, famoso ou que busca holofotes. Ele existe apenas para ser útil, quieto e acessível. Quem realmente precisar e persistir em sua busca, um dia poderá encontrá-lo e usá-lo sem complicações. Não há intenção de ganhar reconhecimento, nem de se expandir: o objetivo único é dar uma forma mais leve e confortável de assistir aos animes que você ama. Tudo aqui é gratuito, sem assinatura e sem limite de uso — se um dia você cair neste repositório, fique à vontade para utilizar o que eu tenho. 🤍

✨ Acesse sem instalar nada: abra o arquivo `index.html` no navegador (Chrome ou Edge), em celular ou computador — totalmente gratuito, sem custos, sem assinaturas, sem anúncios e sem precisar criar contas.

🎧 O que ele faz

Nele, você anexa o vídeo do anime (MP4) e a legenda (.SRT ou .VTT), e ele dubla tudo com voz neural natural — sem aquele efeito robótico das vozes do celular. A grande magia está em duas formas de usar:

- **Dublagem em tempo real:** dê play no vídeo e as falas são narradas junto com a cena, com rolagem automática da legenda no editor e com o volume do anime abaixando sozinho na hora da fala (ducking), para a voz ficar sempre clara.
- **MP3 dublado no ritmo do SRT:** funciona até sem o vídeo — só com a legenda. Ele gera um arquivo de áudio com cada fala no seu tempo exato da legenda, pronto para você juntar com o vídeo fora daqui (CapCut, Premiere etc.). É o jeito de criar a sua própria versão dublada do episódio.

E o melhor: vídeo, legenda, posição, preferências e as vozes já geradas ficam salvos no seu navegador — você não perde nada ao fechar a página.

💡 Dica para facilitar ainda mais (sem nenhum custo)
Como o projeto é totalmente gratuito, você pode conseguir a legenda do seu anime com qualquer ferramenta de transcrição/legendagem (inclusive IAs gratuitas) e depois é só anexar aqui. Se a legenda estiver adiantada ou atrasada em relação ao áudio, use o **Editor de Legendas em Tempo Real**: dá para ajustar o tempo de cada fala, deslocar todas de uma vez, desfazer, e baixar o SRT já sincronizado.

📋 Como usar, passo a passo

1. Abra o `index.html` no navegador.
2. Anexe o vídeo (MP4) e a legenda (.SRT ou .VTT). Dá para usar só a legenda também, se você só quiser gerar o MP3.
3. Escolha o **idioma 🌎** e a **voz neural 🗣️** (o padrão é a Francisca, em português do Brasil 🇧🇷). Aperte **🔊 Testar voz** para ouvir uma amostra.
4. Ajuste os volumes (vídeo e voz), a velocidade da voz e o ducking (quanto o vídeo abaixa na hora da fala).
5. Clique em **⬇ Gerar vozes de todas as falas** uma vez (precisa de internet só nessa hora). Depois disso, a dublagem toca sem espera e sem internet.
6. Dê play no vídeo para assistir dublado — ou clique em **🎧 Gerar MP3 dublado** e depois em **⬇ Baixar MP3** para levar o áudio e muxar onde quiser.

🗣️ Sobre as vozes

São mais de 300 vozes neurais em 139 idiomas, gratuitas, sem conta e sem chave — com prioridade para o português do Brasil 🇧🇷. Se a nuvem de vozes estiver ocupada na hora, o app usa sozinho a voz do seu aparelho como reserva, para a história nunca travar. Na exportação do MP3, falas um pouco maiores que o tempo da legenda são aceleradas automaticamente (até o limite natural); se alguma fala não couber nem assim, o app avisa quais estouraram, para você ajustar no editor e gerar de novo.

ℹ️ Detalhes importantes (limitações, com honestidade)

Por ser um projeto feito por uma pessoa só, gratuito e sem servidor próprio, ele depende de um serviço público e gratuito de vozes para gerar a narração — então existem limitações, e prefiro ser transparente:

- É preciso estar **online na hora de gerar as vozes** (depois, a dublagem em tempo real e o MP3 já gerado funcionam offline com o cache).
- Em horários de pico, pode haver **fila de alguns segundos** na geração de cada fala — o botão de pré-gerar existe justamente para você gerar tudo uma vez e assistir tranquilo depois.
- O MP3 sai em qualidade padrão (suficiente para dublagem) e falas muito longas para um tempo muito curto de legenda podem precisar de ajuste manual no editor.
- Vídeos muito grandes podem não caber no salvamento automático do navegador — nesse caso, é só anexar o vídeo de novo na próxima vez (a legenda e as vozes continuam salvas).
- Todo o processamento acontece no seu navegador: nenhum vídeo é enviado para servidor nenhum. Somente o **texto das falas** é enviado ao serviço gratuito de vozes na hora de gerar cada narração — imagens, vídeos e arquivos ficam sempre com você.

🔧 Para curiosos: como o código funciona

O projeto foi feito com ferramentas simples, em um único arquivo `index.html` (HTML + CSS + JavaScript puro, sem build e sem dependências complicadas), o que garante leveza e privacidade:

- A narração em tempo real usa a Web Audio API: o vídeo passa por um controle de volume, a voz por outro, e o ducking alterna entre eles a cada fala.
- As vozes neurais vêm do serviço público innoai/Edge-TTS (via Hugging Face Spaces), com cache das falas geradas no aparelho (IndexedDB), para não gerar duas vezes a mesma frase.
- O MP3 dublado é montado com `OfflineAudioContext` (cada fala posicionada no tempo exato da legenda) e codificado com `lamejs` (carregado via CDN só na hora de exportar, com fallback para WAV se o codificador estiver inacessível).
- O editor de legendas ajusta os tempos em memória, mantém os tempos originais para comparar/reverter e salva tudo automaticamente.

Que este pequeno trabalho traga um pouco mais de alegria e acesso às histórias que você ama. Que ele chegue às mãos e ouvidos de quem realmente precisa, no tempo certo. 🤍
