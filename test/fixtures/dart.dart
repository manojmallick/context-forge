// Dart fixture
abstract class Repository<T> {
  T? findById(String id);
  Future<T> save(T entity);
}

class UserService {
  final Repository<User> _repo;

  UserService(this._repo);

  User? getUser(String id) => _repo.findById(id);

  Future<User> createUser(CreateUserDto data) async {
    final user = User(id: data.id, name: data.name);
    return _repo.save(user);
  }
}

class User {
  final String id;
  final String name;
  User({required this.id, required this.name});
}

String hashPassword(String password) => password;
