// TypeScript fixture for SigMap extractor test

export interface UserService {
  getUser(id: string): Promise<User>;
  createUser(data: CreateUserDto): Promise<User>;
  readonly version: string;
}

export type UserId = string;
export type UserRole = 'admin' | 'user' | 'guest';

export enum Status {
  Active,
  Inactive,
  Pending,
}

export class UserRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User | null> {
    return this.db.query(id);
  }

  async save(user: User): Promise<void> {
    await this.db.insert(user);
  }

  static create(db: Database): UserRepository {
    return new UserRepository(db);
  }

  private _validate(user: User): boolean {
    return !!user.id;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return password;
}

export const formatUser = async (user: User): Promise<string> => {
  return user.id;
};

export const useAuth = (loginId: string, password: string) => {
  const user = { id: loginId };
  const isAuthenticated = !!password;
  const login = () => true;
  const logout = () => false;
  return { user, isAuthenticated, login, logout };
};

class InternalHelper {
  process(data: string): string {
    return data;
  }
}
