// C# fixture
using System.Threading.Tasks;

namespace Example
{
    public class UserService
    {
        private readonly IUserRepository _repo;

        public UserService(IUserRepository repo)
        {
            _repo = repo;
        }

        public User GetUser(string id)
        {
            return _repo.FindById(id);
        }

        public async Task<User> CreateUserAsync(CreateUserDto dto)
        {
            return await _repo.SaveAsync(new User(dto));
        }

        protected void ValidateUser(User user)
        {
            if (user == null) throw new ArgumentNullException();
        }
    }

    public interface IUserRepository
    {
        User FindById(string id);
        Task<User> SaveAsync(User user);
    }

    public enum UserStatus { Active, Inactive }

    public record UserDto(string Id, string Name);
}
