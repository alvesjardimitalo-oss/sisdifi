import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment, assertFails, assertSucceeds
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, collection, getDocs, serverTimestamp, writeBatch
} from 'firebase/firestore';

const projectId = 'demo-sisdifi';
const env = await initializeTestEnvironment({
  projectId,
  firestore: { rules: readFileSync('firestore.rules', 'utf8') }
});

try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const users = [
      ['admin', 'admin'], ['operador', 'operador'], ['consulta', 'consulta'],
      ['secretaria-a', 'secretaria'], ['secretaria-b', 'secretaria'],
      ['rh', 'rh'], ['fiscal', 'fiscal']
    ];
    for (const [uid, perfil] of users) {
      await setDoc(doc(db, 'usuarios', uid), {
        uid, perfil, ativo: true,
        ...(uid === 'secretaria-a' ? { secretaria_id: 'sec-a' } : {}),
        ...(uid === 'secretaria-b' ? { secretaria_id: 'sec-b' } : {})
      });
    }
    await setDoc(doc(db, 'servidores_privado', 'servidor-a'), {
      secretaria_id: 'sec-a', cpf: '12345678901', chave_pix: '12345678901'
    });
    await setDoc(doc(db, 'servidores_privado', 'servidor-b'), {
      secretaria_id: 'sec-b', cpf: '10987654321', chave_pix: '10987654321'
    });
    await setDoc(doc(db, 'cpfs', '12345678901'), { servidor_id: 'servidor-a' });
    await setDoc(doc(db, 'solicitacoes', 'antiga-com-dados'), {
      servidor_id: 'servidor-a', secretaria_id: 'sec-a', interna: false, visivel_secretaria: true,
      servidor: { nome: 'Servidor A', cpf: '12345678901', chave_pix: '12345678901' }
    });
    await setDoc(doc(db, 'solicitacoes', 'antiga-saneada'), {
      servidor_id: 'servidor-a', secretaria_id: 'sec-a', interna: false, visivel_secretaria: true,
      servidor: { nome: 'Servidor A', cpf_mascara: '***.***.***-01' }
    });
    await setDoc(doc(db, 'solicitacoes', 'saneada-secretaria'), {
      servidor_id: 'servidor-a', secretaria_id: 'sec-a', interna: false, visivel_secretaria: true,
      servidor: { nome: 'Servidor A', cpf_mascara: '***.***.***-01' }
    });
    await setDoc(doc(db, 'solicitacoes_privado', 'antiga-com-dados'), {
      solicitacao_id: 'antiga-com-dados', servidor_id: 'servidor-a', secretaria_id: 'sec-a',
      cpf: '12345678901', chave_pix: '12345678901'
    });
    await setDoc(doc(db, 'solicitacoes_privado', 'outra-secretaria'), {
      solicitacao_id: 'outra-secretaria', servidor_id: 'servidor-b', secretaria_id: 'sec-b',
      cpf: '10987654321', chave_pix: '10987654321'
    });
  });

  const db = uid => env.authenticatedContext(uid).firestore();

  // CPF/Pix não podem permanecer no documento consultável da solicitação.
  await assertFails(getDoc(doc(db('consulta'), 'solicitacoes', 'antiga-com-dados')));
  await assertSucceeds(getDoc(doc(db('consulta'), 'solicitacoes', 'antiga-saneada')));
  await assertFails(getDoc(doc(db('consulta'), 'solicitacoes_privado', 'antiga-com-dados')));
  await assertSucceeds(getDoc(doc(db('operador'), 'solicitacoes_privado', 'antiga-com-dados')));
  await assertSucceeds(getDoc(doc(db('secretaria-a'), 'solicitacoes_privado', 'antiga-com-dados')));
  await assertFails(getDoc(doc(db('secretaria-a'), 'solicitacoes_privado', 'outra-secretaria')));
  await assertSucceeds(setDoc(doc(db('operador'), 'solicitacoes_privado', 'antiga-saneada'), {
    solicitacao_id: 'antiga-saneada', servidor_id: 'servidor-a', secretaria_id: 'sec-a',
    cpf: '12345678901'
  }));
  await assertSucceeds(setDoc(doc(db('secretaria-a'), 'solicitacoes_privado', 'antiga-saneada'), {
    solicitacao_id: 'antiga-saneada', servidor_id: 'servidor-a', secretaria_id: 'sec-a',
    chave_pix: '12345678901'
  }));

  // CPF e Pix integrais não ficam acessíveis ao perfil de consulta.
  await assertFails(getDoc(doc(db('consulta'), 'servidores_privado', 'servidor-a')));
  await assertFails(getDoc(doc(db('consulta'), 'cpfs', '12345678901')));

  // Contabilidade/RH mantêm acesso funcional; Secretaria só acessa a própria pasta.
  await assertSucceeds(getDoc(doc(db('operador'), 'servidores_privado', 'servidor-a')));
  await assertSucceeds(getDoc(doc(db('rh'), 'servidores_privado', 'servidor-a')));
  await assertSucceeds(getDoc(doc(db('secretaria-a'), 'servidores_privado', 'servidor-a')));
  await assertFails(getDoc(doc(db('secretaria-a'), 'servidores_privado', 'servidor-b')));
  await assertSucceeds(getDoc(doc(db('secretaria-a'), 'cpfs', '12345678901')));\n  await assertFails(getDoc(doc(db('secretaria-a'), 'cpfs', '10987654321')));
  await assertFails(getDocs(collection(db('operador'), 'cpfs')));

  // O índice de CPF só aceita o vínculo mínimo com um servidor da própria secretaria.
  await assertFails(setDoc(doc(db('secretaria-a'), 'cpfs', '11111111111'), {
    servidor_id: 'servidor-b'
  }));
  const cadastro = writeBatch(db('secretaria-a'));
  cadastro.set(doc(db('secretaria-a'), 'servidores_privado', 'servidor-novo'), {
    secretaria_id: 'sec-a', cpf: '11111111111'
  });
  cadastro.set(doc(db('secretaria-a'), 'cpfs', '11111111111'), { servidor_id: 'servidor-novo' });
  await assertSucceeds(cadastro.commit());
  await assertFails(setDoc(doc(db('operador'), 'cpfs', '123'), {
    servidor_id: 'servidor-a'
  }));

  // Logs aceitam apenas o próprio UID, estrutura conhecida e timestamp do servidor.
  await assertSucceeds(setDoc(doc(db('operador'), 'logs', 'log-valido'), {
    uid: 'operador', nome: 'Operador', acao: 'solicitacao.criar',
    detalhe: { numero: '0001/2026' }, em: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db('operador'), 'logs', 'uid-alheio'), {
    uid: 'admin', nome: 'Admin', acao: 'solicitacao.criar',
    detalhe: {}, em: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db('operador'), 'logs', 'campo-extra'), {
    uid: 'operador', nome: 'Operador', acao: 'solicitacao.criar',
    detalhe: {}, em: serverTimestamp(), cpf: '12345678901'
  }));
  await assertFails(setDoc(doc(db('operador'), 'logs', 'sem-hora-servidor'), {
    uid: 'operador', nome: 'Operador', acao: 'solicitacao.criar',
    detalhe: {}, em: new Date()
  }));
  await assertFails(setDoc(doc(db('operador'), 'logs', 'fiscal-nao-admin'), {
    uid: 'operador', nome: 'Operador', acao: 'fiscal.aliquotas',
    detalhe: {}, em: serverTimestamp()
  }));
  await assertSucceeds(setDoc(doc(db('admin'), 'logs', 'fiscal-admin'), {
    uid: 'admin', nome: 'Administrador', acao: 'fiscal.aliquotas',
    detalhe: {}, em: serverTimestamp()
  }));

  console.log('Firestore Rules: todos os cenários de segurança passaram.');
} finally {
  await env.cleanup();
}
