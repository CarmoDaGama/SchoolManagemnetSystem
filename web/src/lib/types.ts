export type Role = 'ADMIN' | 'OPERADOR';

export interface Utilizador {
  id: number;
  nome: string;
  username: string;
  role: Role;
  activo?: boolean;
}

export interface Empresa {
  id: number;
  nome: string;
  nif: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  logotipo: string | null;
  moeda: string;
  diaLimite: number;
  diasTolerancia: number;
  tipoMulta: 'PERCENTAGEM' | 'VALOR_FIXO';
  multaValor: string;
  taxaInscricao: string;
  taxaConfirmacao: string;
  configurada: boolean;
}

export interface Mes {
  chave: string; // "2026-10"
  nome: string; // "Outubro 2026"
}

export interface AnoLectivo {
  id: number;
  nome: string;
  anoInicio: number;
  mesInicio: number;
  mesesServico: number;
  activo: boolean;
  meses: Mes[];
  _count?: { inscricoes: number };
}

export type Turno = 'MANHA' | 'TARDE' | 'MANHA_E_TARDE';
export type Sentido = 'IDA_E_VOLTA' | 'SO_IDA' | 'SO_VOLTA';

export interface Rota {
  id: number;
  codigo: string;
  nome: string;
  turno: Turno;
  motorista: string | null;
  telefoneMotorista: string | null;
  viatura: string | null;
  capacidade: number;
  valorMensal: string;
  paragens: string | null;
  activa: boolean;
  ocupacao?: number;
}

export interface Encarregado {
  id: number;
  nome: string;
  telefone: string;
  telefoneAlt: string | null;
  email: string | null;
  parentesco: string | null;
  morada: string | null;
}

export type EstadoInscricao = 'ACTIVA' | 'SUSPENSA' | 'CANCELADA';

export interface Inscricao {
  id: number;
  alunoId: number;
  anoLectivoId: number;
  rotaId: number;
  tipo: 'NOVA' | 'CONFIRMACAO';
  estado: EstadoInscricao;
  sentido: Sentido;
  pontoRecolha: string | null;
  horaRecolha: string | null;
  mesEntrada: string;
  valorMensal: string;
  valorEspecial: boolean;
  motivoValor: string | null;
  data: string;
  rota: Rota;
  anoLectivo?: AnoLectivo;
}

export interface Aluno {
  id: number;
  numero: string;
  nome: string;
  dataNascimento: string | null;
  genero: 'M' | 'F' | null;
  colegio: string | null;
  classe: string | null;
  turma: string | null;
  morada: string | null;
  pontoReferencia: string | null;
  observacoes: string | null;
  encarregadoId: number | null;
  encarregado: Encarregado | null;
}

export type EstadoVisivel = 'PAGA' | 'ISENTA' | 'ANULADA' | 'ATRASO' | 'POR_PAGAR';

export interface Cobranca {
  id: number;
  inscricaoId: number;
  tipo: 'INSCRICAO' | 'CONFIRMACAO' | 'MENSALIDADE';
  descricao: string;
  referencia: string;
  valor: string;
  vencimento: string;
  estado: 'PENDENTE' | 'PAGA' | 'ISENTA' | 'ANULADA';
  motivo: string | null;
  estadoVisivel: EstadoVisivel;
  multa: string;
}
