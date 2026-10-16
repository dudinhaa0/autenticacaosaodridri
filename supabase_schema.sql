-- Rode isso no Supabase: SQL Editor > New query > cole tudo > Run

-- Tabela de funcionários
create table if not exists funcionarios (
  id bigint generated always as identity primary key,
  nome text not null,
  cargo text,
  setor text,
  email text,
  telefone text,
  status text default 'Ativo',
  foto text,
  criado_em timestamp with time zone default now()
);

-- Tabela de registros de ponto (entrada/saída)
create table if not exists registros (
  id bigint generated always as identity primary key,
  funcionario_id bigint references funcionarios (id) on delete cascade,
  tipo text not null,        -- 'entrada' ou 'saida'
  data date not null,
  hora time not null,
  criado_em timestamp with time zone default now()
);

-- Liga o RLS (Row Level Security) nas duas tabelas
alter table funcionarios enable row level security;
alter table registros enable row level security;

-- Policy: qualquer pessoa (anon) pode LER funcionarios
create policy "Leitura publica de funcionarios"
  on funcionarios for select
  using (true);

-- Policy: qualquer pessoa (anon) pode LER registros
create policy "Leitura publica de registros"
  on registros for select
  using (true);

-- (Opcional, só pra já ter dados de teste na tela)
insert into funcionarios (nome, cargo, setor, email, telefone, status)
values
  ('Dr. Carlos Mendes', 'Médico', 'UTI', 'carlos@saodridri.com', '(11) 99999-1111', 'Ativo'),
  ('Enf. Mariana Santos', 'Enfermeira', 'Emergência', 'mariana@saodridri.com', '(11) 99999-2222', 'Ativo'),
  ('Dr. André Lima', 'Médico', 'Cardiologia', 'andre@saodridri.com', '(11) 99999-3333', 'Ativo'),
  ('Tec. Ana Costa', 'Técnica de Enfermagem', 'Pediatria', 'ana@saodridri.com', '(11) 99999-4444', 'Inativo');
