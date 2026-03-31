// Java fixture
package com.example;

public class UserService {
    private final UserRepository repo;

    public UserService(UserRepository repo) {
        this.repo = repo;
    }

    public User getUser(String id) {
        return repo.findById(id);
    }

    public User createUser(CreateUserDto dto) {
        return repo.save(new User(dto));
    }

    protected void validateUser(User user) {
        if (user == null) throw new IllegalArgumentException();
    }
}

public interface Repository<T, ID> {
    T findById(ID id);
    T save(T entity);
    void delete(ID id);
}
