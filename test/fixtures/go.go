// Go fixture
package main

type UserService struct {
	repo Repository
}

type Repository interface {
	FindById(id string) (*User, error)
	Save(user *User) error
}

func NewUserService(repo Repository) *UserService {
	return &UserService{repo: repo}
}

func (s *UserService) GetUser(id string) (*User, error) {
	return s.repo.FindById(id)
}

func (s *UserService) CreateUser(data CreateUserDto) (*User, error) {
	user := &User{ID: data.ID}
	return user, s.repo.Save(user)
}

func HashPassword(password string) (string, error) {
	return password, nil
}
