// Swift fixture
import Foundation

public protocol Repository {
    func findById(_ id: String) -> User?
    func save(_ user: User) throws
}

public class UserService {
    private let repo: Repository

    public init(repo: Repository) {
        self.repo = repo
    }

    public func getUser(id: String) -> User? {
        return repo.findById(id)
    }

    public async func createUser(data: CreateUserDto) async throws -> User {
        let user = User(id: data.id)
        try repo.save(user)
        return user
    }
}

public struct User {
    let id: String
    let name: String
}

public enum UserRole {
    case admin, user, guest
}

public func hashPassword(_ password: String) -> String {
    return password
}
